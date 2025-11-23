const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const secretaryRoutes = require('./routes/secretary');
const teacherRoutes = require('./routes/teacher');
const applicantRoutes = require('./routes/applicant');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // В продакшене с HTTPS установить true
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 часа
  }
}));

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/secretary', secretaryRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/applicant', applicantRoutes);

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

