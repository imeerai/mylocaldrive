const { body, validationResult } = require("express-validator");

const normalizeComparable = (value) => String(value || '').trim().toLowerCase();

// Define validation rules using express-validator chain
// This validates user input during registration process
const registerValidationRules = () => {
  return [
    body("username")
      .trim()
      .notEmpty().withMessage("Username is required")
      .isLength({ min: 3 }).withMessage("Username must be at least 3 characters")
      .isLength({ max: 20 }).withMessage("Username must be less than 20 characters")
      .matches(/^[a-zA-Z0-9_]+$/).withMessage("Username can only contain letters, numbers, and underscores"),
    
    body("email")
      .trim()
      .notEmpty().withMessage("Email is required")
      .isEmail().withMessage("Please enter a valid email address"),
    
    body("password")
      .notEmpty().withMessage("Password is required")
      .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
      .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter")
      .matches(/[a-z]/).withMessage("Password must contain at least one lowercase letter")
      .matches(/[0-9]/).withMessage("Password must contain at least one number")
      .custom((password, { req }) => {
        const normalizedPassword = normalizeComparable(password);
        const normalizedEmail = normalizeComparable(req.body?.email);
        const normalizedUsername = normalizeComparable(req.body?.username);

        if (normalizedPassword && (normalizedPassword === normalizedEmail || normalizedPassword === normalizedUsername)) {
          throw new Error("Password cannot be the same as email or username");
        }

        return true;
      })
  ];
};

const loginValidationRules = () => {
  return [
    body("username")
      .trim()
      .notEmpty().withMessage("Username is required")
      .isLength({ min: 3 }).withMessage("Username must be at least 3 characters")
      .isLength({ max: 20 }).withMessage("Username must be less than 20 characters")
      .matches(/^[a-zA-Z0-9_]+$/).withMessage("Username can only contain letters, numbers, and underscores"),

    body("password")
      .notEmpty().withMessage("Password is required")
      .isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  ];
};

// Validation error handler
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => err.msg).join(', ');
    const isLoginPage = req.path.includes('login');
    const redirectUrl = isLoginPage ? '/user/login' : '/user/register';
    return res.redirect(`${redirectUrl}?error=${encodeURIComponent(errorMessages)}`);
  }
  next();
};

module.exports = {
  registerValidationRules,
  loginValidationRules,
  validate
};
