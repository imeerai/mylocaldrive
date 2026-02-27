# MyDrive - Secure File Storage Platform

MyDrive is a full-stack cloud storage application where users can create accounts and securely upload, organize, and manage files.

## Quick Access

- **Live Demo:** https://mylocaldrive.vercel.app/
- **Local URL:** http://localhost:3000

> Replace the live demo

## Visual Preview

![MyDrive Preview 1](display/up1.png)
![MyDrive Preview 2](display/up2.png)

## What We Actually Built

- Complete auth flow: register, login, logout, OTP verification
- Password recovery flow: forgot password, OTP verify, reset password
- File manager: upload, rename, delete, download
- User dashboard with usage/stats and file operations
- Profile management: update name and change password
- Contact form with email handling
- Protected routes with authentication middleware

## Tech Used (Actual)

### Backend
- Node.js
- Express.js
- MongoDB + Mongoose

### Frontend
- EJS templating
- Vanilla JavaScript
- CSS

### Storage & Email
- Cloudflare R2 (S3-compatible object storage)
- Multer (file upload handling)
- Nodemailer + SMTP (OTP and reset emails)

### Security & Validation
- JWT authentication
- bcrypt password hashing
- Helmet security headers
- Express rate limiting
- Input sanitization + request validation
- Token blacklist on logout

## Project Structure

- `controllers/` business logic (auth, files, profile, stats)
- `routes/` route definitions
- `models/` MongoDB schemas
- `middleware/` auth, sanitize, validation, error handling
- `config/` db, email, multer, r2 setup
- `views/` EJS pages
- `public/` client-side JS/CSS

## Run Locally

```bash
npm install
npm run dev
```

## Environment Variables Required

MongoDB URI, JWT secret, SMTP credentials, and Cloudflare R2/S3 credentials are required.

## Author

IMEER.ai






