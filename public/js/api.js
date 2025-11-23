// API клиент для работы с backend

const API_BASE = '/api';

class API {
  static async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      
      // Проверяем Content-Type перед парсингом JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('API Error: Expected JSON but got:', contentType, text.substring(0, 200));
        throw new Error('Сервер вернул неверный формат данных. Возможно, требуется перезапуск сервера.');
      }
      
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка запроса');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Auth
  static async loginApplicant(email, password) {
    return this.request('/auth/login/applicant', {
      method: 'POST',
      body: { email, password }
    });
  }

  static async loginStaff(email, password) {
    return this.request('/auth/login/staff', {
      method: 'POST',
      body: { email, password }
    });
  }

  static async registerApplicant(data) {
    return this.request('/auth/register/applicant', {
      method: 'POST',
      body: data
    });
  }

  static async registerStaff(data) {
    return this.request('/auth/register/staff', {
      method: 'POST',
      body: data
    });
  }

  static async getAuthSpecialties() {
    return this.request('/auth/specialties');
  }

  static async logout() {
    return this.request('/auth/logout', { method: 'POST' });
  }

  static async getCurrentUser() {
    return this.request('/auth/me');
  }

  // Secretary
  static async getDashboardStats() {
    return this.request('/secretary/dashboard/stats');
  }

  static async getApplicants(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/secretary/applicants${query ? '?' + query : ''}`);
  }

  static async getApplicant(id) {
    return this.request(`/secretary/applicants/${id}`);
  }

  static async createApplicant(data) {
    return this.request('/secretary/applicants', {
      method: 'POST',
      body: data
    });
  }

  static async updateApplicant(id, data) {
    return this.request(`/secretary/applicants/${id}`, {
      method: 'PUT',
      body: data
    });
  }

  static async getGroups() {
    return this.request('/secretary/groups');
  }

  static async getGroup(id) {
    return this.request(`/secretary/groups/${id}`);
  }

  static async createGroup(data) {
    return this.request('/secretary/groups', {
      method: 'POST',
      body: data
    });
  }

  static async addTeacherToGroup(groupId, teacherId) {
    return this.request(`/secretary/groups/${groupId}/teachers`, {
      method: 'POST',
      body: { teacher_id: teacherId }
    });
  }

  static async removeTeacherFromGroup(groupId, teacherId) {
    return this.request(`/secretary/groups/${groupId}/teachers/${teacherId}`, {
      method: 'DELETE'
    });
  }

  static async addApplicantToGroup(groupId, applicantId) {
    return this.request(`/secretary/groups/${groupId}/applicants`, {
      method: 'POST',
      body: { applicant_id: applicantId }
    });
  }

  static async removeApplicantFromGroup(groupId, applicantId) {
    return this.request(`/secretary/groups/${groupId}/applicants/${applicantId}`, {
      method: 'DELETE'
    });
  }

  static async getAvailableApplicants(groupId) {
    return this.request(`/secretary/groups/${groupId}/available-applicants`);
  }

  static async getTeachersList(groupId) {
    return this.request(`/secretary/groups/${groupId}/teachers-list`);
  }

  static async getApplicantsList(groupId) {
    return this.request(`/secretary/groups/${groupId}/applicants-list`);
  }

  static async updateGroupResults(groupId, results) {
    return this.request(`/secretary/groups/${groupId}/results`, {
      method: 'PUT',
      body: { results }
    });
  }

  static async getSpecialties() {
    return this.request('/secretary/specialties');
  }

  static async createSpecialty(data) {
    return this.request('/secretary/specialties', {
      method: 'POST',
      body: data
    });
  }

  static async updateSpecialty(id, data) {
    return this.request(`/secretary/specialties/${id}`, {
      method: 'PUT',
      body: data
    });
  }

  static async deleteSpecialty(id) {
    return this.request(`/secretary/specialties/${id}`, {
      method: 'DELETE'
    });
  }

  static async getSpecialtySubjects(id) {
    return this.request(`/secretary/specialties/${id}/subjects`);
  }

  static async getTeachers() {
    return this.request('/secretary/teachers');
  }

  static async createTeacher(data) {
    return this.request('/secretary/teachers', {
      method: 'POST',
      body: data
    });
  }

  static async updateTeacher(id, data) {
    return this.request(`/secretary/teachers/${id}`, {
      method: 'PUT',
      body: data
    });
  }

  static async deleteTeacher(id) {
    return this.request(`/secretary/teachers/${id}`, {
      method: 'DELETE'
    });
  }

  static async getSubjects() {
    return this.request('/secretary/subjects');
  }

  static async createSubject(data) {
    return this.request('/secretary/subjects', {
      method: 'POST',
      body: data
    });
  }

  static async updateSubject(id, data) {
    return this.request(`/secretary/subjects/${id}`, {
      method: 'PUT',
      body: data
    });
  }

  static async deleteSubject(id) {
    return this.request(`/secretary/subjects/${id}`, {
      method: 'DELETE'
    });
  }

  // Teacher
  static async getTeacherGroups() {
    return this.request('/teacher/groups');
  }

  static async getTeacherGroup(id) {
    return this.request(`/teacher/groups/${id}`);
  }

  static async updateTeacherGroupResults(groupId, results) {
    return this.request(`/teacher/groups/${groupId}/results`, {
      method: 'PUT',
      body: { results }
    });
  }

  // Applicant
  static async getApplication() {
    return this.request('/applicant/application');
  }
}

