// Утилиты для работы с аутентификацией

let currentUser = null;

async function checkAuth() {
  try {
    const response = await API.getCurrentUser();
    currentUser = response.user;
    return currentUser;
  } catch (error) {
    currentUser = null;
    return null;
  }
}

function redirectByRole(user) {
  if (!user) {
    window.location.href = '/';
    return;
  }

  if (user.type === 'applicant') {
    window.location.href = '/applicant.html';
  } else if (user.type === 'staff') {
    if (user.is_secretary) {
      window.location.href = '/secretary/dashboard.html';
    } else if (user.is_teacher) {
      window.location.href = '/teacher.html';
    } else {
      alert('У вас нет доступа к системе');
      window.location.href = '/';
    }
  }
}

function logout() {
  API.logout().then(() => {
    currentUser = null;
    window.location.href = '/';
  }).catch(error => {
    console.error('Ошибка при выходе:', error);
    currentUser = null;
    window.location.href = '/';
  });
}

