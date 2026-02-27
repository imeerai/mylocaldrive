const stripTags = (value) => value
  .replace(/<\s*script.*?>.*?<\s*\/\s*script\s*>/gi, '')
  .replace(/[<>]/g, '');

const sanitizeValue = (value) => {
  if (typeof value === 'string') {
    return stripTags(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    const cleanObj = {};
    Object.keys(value).forEach((key) => {
      // Remove NoSQL injection characters from keys ($, .)
      const cleanKey = key.replace(/[\$.]/g, '');
      if (cleanKey === key) {
        cleanObj[key] = sanitizeValue(value[key]);
      }
      // Skip keys containing NoSQL operators
    });
    return cleanObj;
  }
  return value;
};

const mockBody = {
  email: 'akbarjamali1121@gmail.com',
  type: 'registration',
  otp: '123456'
};

console.log("Original body: ", mockBody);
console.log("Sanitized body: ", sanitizeValue(mockBody));
