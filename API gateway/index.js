const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const axios = require("axios");
require("dotenv").config();

const app = express();

// Load environment variables
const PORT = process.env.PORT || 4000;
const LOGIN_SERVICE_URL = process.env.LOGIN_SERVICE_URL;
const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL;

// Middleware to validate token by calling /validate-token API in login service
async function authenticateToken(req, res, next) {
  const token =
    req.headers["authorization"] && req.headers["authorization"].split(" ")[1];

  // If no token, redirect to login page with a callback URL
  if (!token) {
    const callbackUrl = encodeURIComponent(
      `${req.protocol}://${req.get("host")}${req.originalUrl}`
    );
    return res.redirect(`${LOGIN_SERVICE_URL}?callbackUrl=${callbackUrl}`);
  }

  try {
    // Call the /validate-token API in the login service
    const response = await axios.post(`${LOGIN_SERVICE_URL}/validate-token`, {
      token: token,
    });

    // Check if the response indicates the token is valid
    if (response.data && response.data.isValid) {
      // Attach the validated token data to the request
      req.user = response.data.data; // You can use this user data in the downstream services

      // If token is valid, proceed to the next middleware
      next();
    } else {
      // If token is invalid, redirect to login
      const callbackUrl = encodeURIComponent(
        `${req.protocol}://${req.get("host")}${req.originalUrl}`
      );
      return res.redirect(`${LOGIN_SERVICE_URL}?callbackUrl=${callbackUrl}`);
    }
  } catch (error) {
    // Handle error in token validation
    console.error("Token validation failed:", error.message);
    const callbackUrl = encodeURIComponent(
      `${req.protocol}://${req.get("host")}${req.originalUrl}`
    );
    return res.redirect(`${LOGIN_SERVICE_URL}?callbackUrl=${callbackUrl}`);
  }
}

// Proxy middleware for chat service, protected by authentication
const chatServiceProxy = createProxyMiddleware({
  target: CHAT_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { "^/chat": "" }, // Remove '/chat' prefix when forwarding
  onProxyReq: (proxyReq, req) => {
    // Optionally, pass the user data to the chat service
    if (req.user) {
      proxyReq.setHeader("x-user-id", req.user.id);
    }
  },
});

// Proxy middleware for login service
const loginServiceProxy = createProxyMiddleware({
  target: LOGIN_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { "^/login": "" }, // Remove '/login' prefix when forwarding
});

// Route for login
app.use("/login", loginServiceProxy);

// Route for chat (protected by token validation through login service)
app.use("/chat", authenticateToken, chatServiceProxy);

// Fallback route for 404
app.use((req, res) => {
  res.status(404).json({ message: "Service not found" });
});

// Start the API Gateway
app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});
