// Middleware для проверки аутентификации

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  next();
}

function requireSecretary(req, res, next) {
  if (!req.session.user || !req.session.user.is_secretary) {
    return res.status(403).json({ error: 'Доступ запрещен. Требуются права секретаря' });
  }
  next();
}

function requireTeacher(req, res, next) {
  if (!req.session.user || !req.session.user.is_teacher) {
    return res.status(403).json({ error: 'Доступ запрещен. Требуются права преподавателя' });
  }
  next();
}

function requireApplicant(req, res, next) {
  if (!req.session.user || req.session.user.type !== 'applicant') {
    return res.status(403).json({ error: 'Доступ запрещен. Требуется авторизация абитуриента' });
  }
  next();
}

module.exports = {
  requireAuth,
  requireSecretary,
  requireTeacher,
  requireApplicant
};

