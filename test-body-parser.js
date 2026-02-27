const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const app = express();
const port = 3001;
const OTP = require('./models/otp.model'); // will fail if DB not connected

// Simple connect
const mongoose = require('mongoose');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/test-otp', (req, res) => {
    console.log("Req body: ", req.body);
    const { email, otp, type } = req.body;
    
    if (!otp || !email) {
        return res.json({ success: false, message: 'Email and OTP required', bodyReceived: req.body });
    }
    res.json({ success: true, message: 'Looks ok', bodyReceived: req.body });
});

app.listen(port, () => {
    console.log(`Test app listening at http://localhost:${port}`);
});
