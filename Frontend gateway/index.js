const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const axios = require("axios");
require("dotenv").config();
const cookieParser = require("cookie-parser");

const app = express();
app.use(cookieParser());

// Load environment variables
const PORT = process.env.PORT || 3000;
const LOGIN_SERVICE_URL = process.env.LOGIN_SERVICE_URL;
const LOGIN_APP_DEV_SERVER = process.env.LOGIN_APP_DEV_SERVER;
const CHAT_APP_DEV_SERVER = process.env.CHAT_APP_DEV_SERVER;

const isProduction = process.env.NODE_ENV === "production";

async function authenticateToken(req, res, next) {
  const token = req?.cookies?.["auth_token"];

  if (!token) {
    const callbackUrl = encodeURIComponent(
      `${req.protocol}://${req.get("host")}${req.originalUrl}`
    );
    const baseURL = `${req.protocol}://${req.get("host")}`;
    const redirectURL = encodeURIComponent(baseURL);
    const URL = `${baseURL}/login?callbackUrl=${callbackUrl}&redirectUrl=${redirectURL}`;
    return res.redirect(URL);
  }

  try {
    // Validate the token via the login service
    const requestBody = {
      token: token,
    };
    const response = await axios.post(
      `${LOGIN_SERVICE_URL}/validate-token`,
      requestBody
    );

    if (response.data && response.data.isValid) {
      req.user = response.data.data;
      next();
    } else {
      const callbackUrl = encodeURIComponent(
        `${req.protocol}://${req.get("host")}${req.originalUrl}`
      );
      const baseURL = `${req.protocol}://${req.get("host")}`;
      const redirectURL = encodeURIComponent(baseURL);
      const URL = `${baseURL}/login?callbackUrl=${callbackUrl}&redirectUrl=${redirectURL}`;
      return res.redirect(URL);
    }
  } catch (error) {
    const callbackUrl = encodeURIComponent(
      `${req.protocol}://${req.get("host")}${req.originalUrl}`
    );
    const baseURL = `${req.protocol}://${req.get("host")}`;
    const redirectURL = encodeURIComponent(baseURL);
    const URL = `${baseURL}/login?callbackUrl=${callbackUrl}&redirectUrl=${redirectURL}`;
    return res.redirect(URL);
  }
}

// Handle callback from login and redirect to chat with token
app.get("/callback", (req, res) => {
  const { token, callbackUrl } = req.query;
  if (token) {
    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      domain: callbackUrl,
    });
    return res.redirect(callbackUrl || "/");
  } else {
    return res.redirect("/login");
  }
});

// In development, proxy to SPA dev servers instead of serving static files
if (!isProduction) {
  // Proxy to the login app development server
  app.use("/login", (req, res, next) => {
    const callbackUrl = req?.query?.callbackUrl || "";
    const baseURL = `${req.protocol}://${req.get("host")}`;
    const redirectURL = encodeURIComponent(baseURL);
    const URL = `${LOGIN_APP_DEV_SERVER}/login?callbackUrl=${callbackUrl}&redirectUrl=${redirectURL}`;
    return res.redirect(URL);
  });

  // Proxy to the chat app development server with token validation
  app.use("/", authenticateToken, (req, res, next) => {
    res.redirect(CHAT_APP_DEV_SERVER);
  });
} else {
  // In production, serve static files for SPAs (as in the earlier example)
  app.use("/login", express.static(path.join(__dirname, "public/login")));
  app.use("/chat", express.static(path.join(__dirname, "public/chat")));
  app.use((req, res) => {
    return res.redirect("/chat");
  });
}

// Start the server
app.listen(PORT, () => {
  console.log(`Frontend router running on port ${PORT}`);
});
