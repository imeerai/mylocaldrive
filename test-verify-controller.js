const mongoose = require('mongoose');
const authController = require('./controllers/auth.controller');
const OTP = require('./models/otp.model');

async function testIt() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mydrive');
    
    const req = {
        body: {
            email: 'akbarjamali1121@gmail.com',
            otp: '123456',
            type: 'registration'
        }
    };
    
    const res = {
        redirect: (url) => {
            console.log("Redirected to:", url);
            process.exit(0);
        }
    };
    
    // We mock the authController logic briefly, but wait we can just call it
    await authController.postVerifyOTP(req, res);
}

require('dotenv').config();
testIt().catch(console.error);
