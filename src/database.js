const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DB_PATH, 'users.json');

// Ensure data folder exists
if (!fs.existsSync(DB_PATH)) {
  fs.mkdirSync(DB_PATH, { recursive: true });
}

// Ensure users file exists
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({}), 'utf-8');
}

function readUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(data || '{}');
  } catch (err) {
    console.error('Error reading users db:', err);
    return {};
  }
}

function writeUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing users db:', err);
  }
}

const Database = {
  // Register a new user
  register(username, password) {
    username = username.trim().toLowerCase();
    if (!username || username.length < 3) {
      return { success: false, message: 'Username must be at least 3 characters.' };
    }
    if (!password || password.length < 4) {
      return { success: false, message: 'Password must be at least 4 characters.' };
    }

    const users = readUsers();
    if (users[username]) {
      return { success: false, message: 'Username is already taken.' };
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    const newUser = {
      username,
      displayName: username,
      passwordHash: hash,
      createdAt: new Date().toISOString(),
      stats: {
        matchesPlayed: 0,
        wins: 0,
        hunterKills: 0,
        propsDiscovered: 0,
        survivalWins: 0,
        tauntsUsed: 0
      },
      trophies: [] // Array of AI rewards & badges
    };

    users[username] = newUser;
    writeUsers(users);

    return {
      success: true,
      user: {
        username: newUser.username,
        displayName: newUser.displayName,
        stats: newUser.stats,
        trophies: newUser.trophies
      }
    };
  },

  // Login
  login(username, password) {
    username = username.trim().toLowerCase();
    const users = readUsers();
    const user = users[username];

    if (!user) {
      return { success: false, message: 'User not found.' };
    }

    const valid = bcrypt.compareSync(password, user.passwordHash);
    if (!valid) {
      return { success: false, message: 'Incorrect password.' };
    }

    return {
      success: true,
      user: {
        username: user.username,
        displayName: user.displayName,
        stats: user.stats,
        trophies: user.trophies || []
      }
    };
  },

  // Get user profile
  getUser(username) {
    username = username.trim().toLowerCase();
    const users = readUsers();
    const user = users[username];
    if (!user) return null;
    return {
      username: user.username,
      displayName: user.displayName,
      stats: user.stats,
      trophies: user.trophies || []
    };
  },

  // Update stats on match completion
  recordMatch(username, isWinner, role, kills = 0, taunts = 0) {
    if (!username) return;
    username = username.trim().toLowerCase();
    const users = readUsers();
    const user = users[username];
    if (!user) return;

    user.stats.matchesPlayed = (user.stats.matchesPlayed || 0) + 1;
    if (isWinner) {
      user.stats.wins = (user.stats.wins || 0) + 1;
      if (role === 'prop') {
        user.stats.survivalWins = (user.stats.survivalWins || 0) + 1;
      }
    }
    if (role === 'hunter') {
      user.stats.hunterKills = (user.stats.hunterKills || 0) + (kills || 0);
    }
    user.stats.tauntsUsed = (user.stats.tauntsUsed || 0) + (taunts || 0);

    writeUsers(users);
  },

  // Add Trophy to user inventory
  addTrophy(username, trophy) {
    if (!username) return;
    username = username.trim().toLowerCase();
    const users = readUsers();
    const user = users[username];
    if (!user) return;

    if (!user.trophies) user.trophies = [];
    user.trophies.unshift({
      ...trophy,
      unlockedAt: new Date().toISOString()
    });

    writeUsers(users);
  },

  // Get top players leaderboard
  getLeaderboard() {
    const users = readUsers();
    const list = Object.values(users).map(u => ({
      username: u.username,
      displayName: u.displayName,
      wins: u.stats.wins || 0,
      matchesPlayed: u.stats.matchesPlayed || 0,
      trophiesCount: (u.trophies || []).length
    }));

    list.sort((a, b) => b.wins - a.wins);
    return list.slice(0, 10);
  }
};

module.exports = Database;
