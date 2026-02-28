const mongoose = require('mongoose');

// Define user schema with built-in validation rules
// Stores user information with email and username uniqueness constraints
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true   , // Ensures no duplicate usernames in database
        trim: true,
        maxlength: [30, 'Username cannot exceed 30 characters'],
        lowercase: true,
        minlength: [3, 'Username must be at least 3 characters long']
    },
    email: {
        type: String,
        required: true,
        unique: true    
        , lowercase: true,
        match: [/.+\@.+\..+/, 'Please fill a valid email address'] 
        , maxlength: [100, 'Email cannot exceed 100 characters'],
        minlength: [5, 'Email must be at least 5 characters long']

    },
    password: {
        type: String,
        required: true,
        minlength: [8, 'Password must be at least 8 characters long'],
        maxlength: [128, 'Password cannot exceed 128 characters'],
        trim: true,
    },
    firstName: {
        type: String,
        default: ''
    },
    lastName: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Cascade delete - delete all files when user is deleted
userSchema.post('findByIdAndDelete', async function(doc) {
    if (doc) {
        const File = require('./file.model');
        await File.deleteMany({ userId: doc._id });
    }
});

module.exports = mongoose.model('User', userSchema);
