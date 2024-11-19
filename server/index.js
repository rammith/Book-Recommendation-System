// server.js
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;
const axios = require('axios');

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/bookrec', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected...'))
    .catch(err => console.error('MongoDB connection error:', err));

// Schemas and Models
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

const bookSchema = new mongoose.Schema({
    ISBN: String,
    title: String,
    author: String,
    yearOfPublication: Number,
    publisher: String,
    imageUrlS: String,
    imageUrlM: String,
    imageUrlL: String,
});

const userDataSchema = new mongoose.Schema({
    username: { type: String, required: true },
    ISBN: String,
    title: String,
    author: String,
    yearOfPublication: Number,
    publisher: String,
    status: { type: String }, // e.g., 'read'
    rating: { type: Number, min: 1, max: 5 },
});

const ratingSchema = new mongoose.Schema({
    username: { type: String, required: true },
    ISBN: String,
    title: String,
    rating: { type: Number, required: true, min: 1, max: 5 },
});

const User = mongoose.model('User', userSchema, 'users');
const Book = mongoose.model('Book', bookSchema, 'books');
const UserData = mongoose.model('UserData', userDataSchema, 'userdata');
const Rating = mongoose.model('Rating', ratingSchema, 'ratings');

// Routes
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.json({ error: 'Username already exists.' });
        }

        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.json({ error: 'Email is already registered.' });
        }

        const newUser = new User({ username, email, password });
        await newUser.save();
        res.json(newUser);
    } catch (error) {
        console.error('Error during user registration:', error);
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

app.post('/login', async (req, res) => {
    const { name, password } = req.body;
    try {
        const user = await User.findOne({ username: name });
        if (user) {
            if (user.password === password) {
                res.json("Success");
            } else {
                res.json("The password is incorrect");
            }
        } else {
            res.json("User doesn't exist");
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json("Server error. Please try again.");
    }
});

// Add "Add to Read" route
app.post('/addToRead', async (req, res) => {
    const { username, ISBN, title, author, yearOfPublication, publisher } = req.body;
    try {
        if (!username || !title) {
            return res.status(400).json({ error: "Invalid input data" });
        }
        const newEntry = new UserData({
            username,
            ISBN,
            title,
            author,
            yearOfPublication,
            publisher,
            status: "to-read",
        });
        await newEntry.save();
        res.json({ message: "Book added to read list" });
    } catch (error) {
        console.error("Error adding book to read list:", error);
        res.status(500).json({ error: "Failed to add book to read list" });
    }
});

// Add "Rate Book" route
app.post('/rateBook', async (req, res) => {
    const { username, ISBN, title, rating } = req.body;
    try {
        const newRating = new Rating({ username, ISBN, title, rating });
        await newRating.save();
        res.json({ message: "Book rated successfully" });
    } catch (error) {
        res.status(500).json({ error: "Failed to rate book" });
    }
});

require('dotenv').config();
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

app.post('/send-feedback', (req, res) => {
    const { name, email, message } = req.body;
    const mailOptions = {
        from: email,
        to: 'sivampradheep@gmail.com',
        subject: 'New Feedback Submission',
        text: `You have received a new feedback submission:\n\nName: ${name}\nEmail: ${email}\nMessage: ${message}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            return res.status(500).send('Error sending feedback');
        }
        res.status(200).send('Feedback sent successfully');
    });
});

app.get('/userdata/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const userData = await UserData.find({ username });
        res.json(userData);
    } catch (error) {
        console.error("Error fetching user data:", error);
        res.status(500).json({ error: "Failed to fetch user data" });
    }
});

// Fetch similar books using Google Books API
async function fetchSimilarBooks(isbn) {
    const apiKey = 'AIzaSyAmRw8ueEaAZInhJID9UeRfnyeJMjRYYv4';
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${apiKey}`;

    try {
        const response = await axios.get(url);
        if (response.status === 200) {
            const books = response.data.items || [];

            // Log the response to inspect the structure of the API data
            console.log('Google Books API Response:', response.data);

            return books.map((book) => {
                const volumeInfo = book.volumeInfo || {};
                return {
                    title: volumeInfo.title || 'No Title Available',
                    authors: Array.isArray(volumeInfo.authors) ? volumeInfo.authors.join(', ') : 'Unknown Author',
                    publishedDate: volumeInfo.publishedDate || 'Unknown Date',
                    description: volumeInfo.description || 'No description available',
                };
            });
        }
    } catch (err) {
        console.error('Failed to fetch similar books:', err);
    }
    return [];
}

// Collaborative Filtering Function
async function collaborativeFiltering(username) {
    const userRatings = await Rating.find({ username });
    if (userRatings.length === 0) {
        return null;
    }

    const similarUsers = await Rating.find({
        ISBN: { $in: userRatings.map((rating) => rating.ISBN) },
        username: { $ne: username },
    });

    const similarUsersBooks = new Set(similarUsers.map((book) => book.ISBN));
    const recommendations = await UserData.find({ ISBN: { $in: Array.from(similarUsersBooks) } });

    return recommendations.length ? recommendations : null;
}

// Content-Based Recommendation Function
async function contentBasedRecommendation(username) {
    const userData = await UserData.findOne({ username });
    if (!userData) {
        return [];
    }

    const allBooks = await UserData.find();
    const allTitles = allBooks.map((book) => book.title);
    const userTitle = userData.title.toLowerCase();
    const similarBooks = allBooks.filter((book) => {
        return (
            book.title.toLowerCase() !== userTitle &&
            book.title.toLowerCase().includes(userTitle)
        );
    });

    return similarBooks;
}

// Generate Recommendations
async function generateRecommendations(username) {
    let recommendations = await collaborativeFiltering(username);
    if (!recommendations) {
        recommendations = await contentBasedRecommendation(username);
    }

    if (recommendations.length === 0) {
        const userData = await UserData.findOne({ username });
        if (userData && userData.ISBN) {
            return await fetchSimilarBooks(userData.ISBN);
        }
    }

    return recommendations;
}

// API endpoint for recommendations
app.get('/recommendations/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const recommendations = await generateRecommendations(username);

        if (recommendations && recommendations.length > 0) {
            res.json(recommendations);
        } else {
            res.status(404).json({ message: 'No recommendations found.' });
        }
    } catch (error) {
        console.error('Error generating recommendations:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
