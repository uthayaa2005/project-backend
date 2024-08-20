require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware for handling CORS and preflight requests
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Expose-Headers", "Auth-Token, Content-Length");
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});

// Middleware for parsing JSON and URL-encoded bodies
const decodeToken = (token) => {
    try {
        return jwt.decode(token);
    } catch (error) {
        console.error("Invalid token", error);
        return null;
    }
};



const API_KEY = process.env.OMDB_API_KEY;
const BASE_URL = 'http://www.omdbapi.com/';
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

console.log('Mongo URI: ', MONGO_URI);

if (!MONGO_URI) {
    console.error('MONGO_URI is not defined. Please check your .env file.');
    process.exit(1);
}


mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected...'))
    .catch(err => console.error('MongoDB connection error:', err));


// Enable CORS and parse json body
app.use(cors());
app.use(express.json());


// Define schema and model
const userSchema = new mongoose.Schema({
    username: String,
    email: String,
    password: String,
});

const favSchema = new mongoose.Schema({
    email: String,
    movie: String
});

const User = mongoose.model('users', userSchema);
const Fav = mongoose.model('favs', favSchema);



const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired' });
            } else {
                return res.status(403).json({ error: 'Invalid token' });
            }
        }
        req.user = user;
        console.log('Authenticated user:', req.user); // Add logging
        next();
    });
};


// Root route
app.get('/', (req, res) => {
    res.send('Welcome to the CineSearch Backend API');
});


// Sign-in route
app.post('/api/signin', async (req, res) => {
    console.log("entered signin");
    const { email, password } = req.body;
    console.log("email", email);

    try {
        const user = await User.findOne({ email });
        console.log(user);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (user.password !== password) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign({ email: user.email, id: user._id }, JWT_SECRET);
        console.log(token);
        res.json({ token });
    } catch (error) {
        console.error('Error signing in:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Sign-up route
app.post('/api/signup', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const newUser = new User({ username, email, password });
        await newUser.save();

        res.status(201).json({ message: 'User signed up successfully' });
    } catch (error) {
        console.error('Error signing up:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Add to favorite route
app.post('/api/favorite', authenticateToken, async (req, res) => {
    console.log(req.body);
    try {
        const email = req.user.email;
        const movie = JSON.stringify(req.body);

        const newFav = new Fav({ email, movie });
        await newFav.save();

        console.log("Data saved");
        res.status(200).json(movie);
    } catch (error) {
        console.error('Error adding favorite:', error);
        res.status(500).json({ error: error.message });
    }
});



// Get favorites route
app.get('/api/favorite', authenticateToken, async (req, res) => {
    try {
        const email = req.user.email;
        const fav = await Fav.find({ email: email });
        res.json(fav);
    } catch (error) {
        console.error('Error getting favorite:', error);
        res.status(500).json({ error: error.message });
    }
});



// Movie Search Route
app.get('/api/search', authenticateToken, async (req, res) => {
    const { name, title } = req.query;
    const token = req.headers.authorization;
    try {
        decodeToken(token);
        console.log(decodeToken(token));
        const response = await axios.get(BASE_URL, {
                params: {
                    apikey: API_KEY,
                    s: name
                }
            });
            console.log(response.data);
            if (response.data.Response === 'True') {
                res.json(response.data);
            } else {
                throw new Error(response.data.Error);
            }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
