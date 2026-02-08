// API Configuration
const API_BASE_URL = 'http://localhost:5000/api';

// Token management
const getToken = () => localStorage.getItem('authToken');
const setToken = (token) => localStorage.setItem('authToken', token);
const removeToken = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('customer');
    localStorage.removeItem('currentAccount');
};

// Generic API call
async function apiCall(endpoint, method = 'GET', body = null, requiresAuth = true) {
    const headers = { 'Content-Type': 'application/json' };
    
    if (requiresAuth) {
        const token = getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Request failed');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Auth API
const AuthAPI = {
    async signup(firstName, lastName, email, password) {
        const data = await apiCall('/auth/signup', 'POST', {
            firstName, lastName, email, password
        }, false);
        
        if (data.token) {
            setToken(data.token);
            localStorage.setItem('customer', JSON.stringify(data.customer));
        }
        return data;
    },

    async login(email, password) {
        const data = await apiCall('/auth/login', 'POST', {
            email, password
        }, false);
        
        if (data.token) {
            setToken(data.token);
            localStorage.setItem('customer', JSON.stringify(data.customer));
        }
        return data;
    },

    logout() {
        removeToken();
        window.location.href = 'login.html';
    }
};

// Accounts API
const AccountsAPI = {
    async getAll() {
        return await apiCall('/accounts');
    },

    async getBalance(accountNumber) {
        return await apiCall(`/accounts/${accountNumber}/balance`);
    },

    async create(accountType, initialDeposit = 0) {
        return await apiCall('/accounts', 'POST', {
            accountType, initialDeposit
        });
    }
};

// Transactions API
const TransactionsAPI = {
    async deposit(accountNumber, amount) {
        return await apiCall('/transactions/deposit', 'POST', {
            accountNumber, amount
        });
    },

    async withdraw(accountNumber, amount) {
        return await apiCall('/transactions/withdraw', 'POST', {
            accountNumber, amount
        });
    },

    async transfer(fromAccountNumber, toAccountNumber, amount) {
        return await apiCall('/transactions/transfer', 'POST', {
            fromAccountNumber, toAccountNumber, amount
        });
    },

    async getHistory(accountNumber) {
        return await apiCall(`/transactions/history/${accountNumber}`);
    },

    async getRecent() {
        return await apiCall('/transactions/recent');
    }
};

// Loans API
const LoansAPI = {
    async apply(loanAmount, interestRate, durationMonths) {
        return await apiCall('/loans', 'POST', {
            loanAmount, interestRate, durationMonths
        });
    },

    async getAll() {
        return await apiCall('/loans');
    },

    async getDetails(loanId) {
        return await apiCall(`/loans/${loanId}`);
    },

    async repay(loanId, amount) {
        return await apiCall(`/loans/${loanId}/repay`, 'POST', { amount });
    },

    async simulate(loanAmount, interestRate, durationMonths) {
        return await apiCall('/loans/simulate', 'POST', {
            loanAmount, interestRate, durationMonths
        }, false);
    }
};

// Customers API
const CustomersAPI = {
    async getProfile() {
        return await apiCall('/customers/profile');
    },

    async updateProfile(firstName, lastName, phone, address) {
        return await apiCall('/customers/profile', 'PUT', {
            firstName, lastName, phone, address
        });
    },

    async getDashboard() {
        return await apiCall('/customers/dashboard');
    }
};

// Check authentication
function checkAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}