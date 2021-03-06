const express = require('express');
const fs = require('fs');
const https = require('https');
const open = require("open");
const escapeHTML = require('escape-html');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv').config({ path: './.env' });

const {
  isPasswordValid,
  isUsernameValid,
  hashPassword,
  verifyPassword
} = require('./app/utils');

const middlewares = require('./app/middlewares');
const errorHandler = middlewares.errorHandler;
const storage = require('./app/storage');

const options = {
  hostname: (process.env.APP_HOSTNAME || 'localhost'),
  port: parseInt((process.env.APP_PORT || 8080), 10),
  key: fs.readFileSync((process.env.APP_KEY || '')),
  cert: fs.readFileSync((process.env.APP_CERT || ''))
};

let app = express();
middlewares.use(app);

const homePage = require('./pages/homePage.js');
const server = https.createServer(options, app);

server.listen(options.port, () => {
  const uri = `https://${options.hostname}:${options.port}`;
  open(uri);
  console.log(uri);
});

app.get('/messages/list', errorHandler(async(req, res) => {
  const messages = await storage.messages.getAll();

  res.json({
    messages: messages
  });
}));

app.get('/', errorHandler(async (req, res) => {
  const currentUser = req.session.currentUser || [];
  const messages = await storage.messages.getAll();

  res.end(homePage({
    messages,
    username: currentUser.username,
    csrfToken: () => (req.createCSRF())
  }));
}));

app.post('/messages', errorHandler((req, res) => {
  const escapeMsg = escapeHTML(req.body.message || '');

  if (escapeMsg.length < 255 && escapeMsg.length > 1) {
    const username = req.session.currentUser.username;
    storage.messages.create(username, escapeMsg);
    res.redirect('/');
  } else {
    res.send('invalid message');
  }
}));

app.post('/logout', errorHandler((req, res) => {
  req.session.destroy();
  res.redirect('/');
}));

app.post('/messages/delete', errorHandler((req, res) => {
  if (req.session.currentUser.username !== req.body.username) {
    res.redirect('wrong credentials');
  } else {
    const message = {
      username: req.session.currentUser.username,
      value: escapeHTML(req.body.value || ''),
      key: escapeHTML(req.body.key || '')
    };

    storage.messages.delete(message)
      .then((onSuccess) => {
        res.redirect('/');
      })
      .catch((onError) => {
        res.send('error delete');
      });
  }
}));

app.post('/signup', errorHandler(async (req, res) => {
  let bSuccess = false;
  let password = escapeHTML(req.body.password || '');
  const username = escapeHTML(req.body.username || '');

  if ((isUsernameValid(username) && isPasswordValid(password))) {
    const user = await storage.users.findByUsername(username);

    if (user === 'USER_NOT_FOUND' || user === 'USER_PARSE_ERROR') {
      bSuccess = true;
      password = hashPassword(password);
      const createdUser = storage.users.create(username, password);
    }
  }

  return bSuccess ? res.redirect('/') : res.send('invalid credentials');
}));

app.post('/login', errorHandler(async (req, res) => {
  let bSuccess = false;
  const username = escapeHTML(req.body.username || '');
  const password = escapeHTML(req.body.password || '');

  if ((isUsernameValid(username) && isPasswordValid(password))) {
    const user = await storage.users.findByUsername(username);

    if (user !== 'USER_NOT_FOUND' && user !== 'USER_PARSE_ERROR') {
      bSuccess = true;
      delete user.password;
      req.session.currentUser = user;
    }
  }

  return bSuccess ? res.redirect('/') : res.send('invalid credentials');
}));
