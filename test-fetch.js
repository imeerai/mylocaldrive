const fetch = require('node-fetch'); // we can just use native fetch in newer node

async function testOtp() {
  try {
    const res = await fetch('http://localhost:3000/user/verify-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'akbarjamali1121@gmail.com',
        otp: '123456',
        type: 'registration'
      })
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
  } catch(e) {
    console.error(e);
  }
}

testOtp();
