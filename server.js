// Express connections
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Database connection
const db = new sqlite3.Database('./db/homebasefile.db', (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to the database.');
  }
});

// Create tables (if not exists)
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      userId INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      password TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS jars (
      jarId INTEGER PRIMARY KEY,
      jarName TEXT NOT NULL,
      jarSummary TEXT NOT NULL,
      jarAccessDate DATE NOT NULL,
      userId INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(userId)
    )
  `);

  db.run(`
  CREATE TABLE IF NOT EXISTS notes (
    noteId INTEGER PRIMARY KEY,
    userId INTEGER NOT NULL,
    jarId INTEGER NOT NULL,
    noteName TEXT NOT NULL,
    noteSummary TEXT NOT NULL,
    noteCreated DATE NOT NULL,
    FOREIGN KEY (jarId) REFERENCES jars (jarId),
    FOREIGN KEY (userId) REFERENCES users (userId)
    )
  `);
});


//Express Routes: Inital Page Access
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

function checkUserSession(req, res, next) {
  const userId = req.cookies.userId;
  if (!userId) {
      return res.redirect('/');
  }
  req.userId = userId;
  next();
}


// Specific Routes: Access to non-home page

// Login Route
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Check if username and password exist and match in the database
    db.get(
        `SELECT userId FROM users WHERE username = ? AND password = ?`,
        [username, password],
        (err, row) => {
            if (err) {
                console.error('Database error:', err.message);
                res.status(500).send('Internal Server Error');
            } else if (!row) {
                res.status(401).send('Invalid username or password');
            } else {
                const userId = row.userId;

                // Set session cookie to expire in 1 hour
                res.cookie('userId', userId, { maxAge: 3600000, httpOnly: true });
                res.redirect('/user-home');
            }
        }
    );
});


// Signup Route
app.post('/signup', (req, res) => {
    const { username, password } = req.body;

    // Generate a 6-digit random user ID
    const userId = Math.floor(100000 + Math.random() * 900000);

    // Insert user data into the database
    db.run(
        `INSERT INTO users (userId, username, password) VALUES (?, ?, ?)`,
        [userId, username, password],
        (err) => {
            if (err) {
                console.error('Error inserting user:', err.message);
                res.status(500).send('Internal Server Error');
            } else {
                // Set session cookie to expire in 1 hour
                res.cookie('userId', userId, { maxAge: 3600000, httpOnly: true });
                res.redirect('/user-home');
            }
        }
    );
});


  // Cookie Route: User Home Page
app.get('/user-home', checkUserSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user-home.html'));
});
  





// Create Jar Route
app.get('/create-jar', (req, res) => {
    const userId = req.cookies.userId;
    if (!userId) {
      return res.redirect('/');
    }
    res.sendFile(__dirname + '/public/create-jar.html');
});
  

// Subroute for the create jar page submission
app.post('/create-jar', (req, res) => {
const userId = req.cookies.userId;
if (!userId) {
    return res.status(401).send('Unauthorized');
}

const { jarName, jarSummary, jarAccessDate } = req.body;
// Generate a 6-digit random user ID
const jarId = Math.floor(100000 + Math.random() * 900000);

// Insert new jar data into the database
const sql = `INSERT INTO jars (jarId, jarName, jarSummary, jarAccessDate, userId) 
                VALUES (?, ?, ?, ?, ?)`;
db.run(sql, [jarId, jarName, jarSummary, jarAccessDate, userId], function(err) {
    if (err) {
    console.error('Error creating jar:', err);
    res.status(500).send('Failed to create jar.');
    } else {
        console.log('New jar created:', jarId);
        // Redirect to user-home.html after successful creation
        res.redirect('/user-home');
    }
});
});




// Route to serve add-to-jar.html and fetch user's jars
app.get('/add-to-jar', checkUserSession, (req, res) => {
  const userId = req.userId;
  const sql = `SELECT jarId, jarName FROM jars WHERE userId = ?`;
  db.all(sql, [userId], (err, rows) => {
      if (err) {
          console.error('Error fetching user jars:', err);
          res.status(500).send('Failed to fetch user jars.');
      } else {
          res.json(rows);
      }
  });
});

// Route to fetch jar details for add-note.html
app.get('/jar-details', checkUserSession, (req, res) => {
  const { jarId } = req.query;
  const sql = `SELECT jarId, jarName, jarSummary, jarAccessDate FROM jars WHERE jarId = ?`;
  db.get(sql, [jarId], (err, row) => {
      if (err) {
          console.error('Error fetching jar details:', err);
          res.status(500).send('Failed to fetch jar details.');
      } else {
          res.json(row);
      }
  });
});

// Route to handle adding a note
app.post('/add-note', checkUserSession, (req, res) => {
  const { noteName, noteSummary, jarId } = req.body;
  const userId = req.userId;
  const noteCreated = new Date().toISOString();
  const noteId = Math.floor(100000 + Math.random() * 900000); // Generate a 6-digit noteId

  const sql = `INSERT INTO notes (noteId, userId, jarId, noteName, noteSummary, noteCreated) 
               VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(sql, [noteId, userId, jarId, noteName, noteSummary, noteCreated], function(err) {
      if (err) {
          console.error('Error adding note:', err);
          res.status(500).send('Failed to add note.');
      } else {
          console.log('New note added:', this.lastID);
          res.redirect('/user-home'); // Redirect to user-home after adding note
      }
  });
});



// Jar Fetch Route (All)
app.get('/user-jars', (req, res) => {
    const userId = req.cookies.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized');
    }
  
    const sql = `SELECT jarId, jarName FROM jars WHERE userId = ?`;
    db.all(sql, [userId], (err, rows) => {
      if (err) {
        console.error('Error fetching user jars:', err);
        res.status(500).send('Failed to fetch user jars.');
      } else {
        res.json(rows);
      }
    });
});
  

// Route to serve read-jar.html and fetch user's jars
app.get('/read-jar', checkUserSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'read-jar.html'));
});

app.get('/get-user-jars', checkUserSession, (req, res) => {
  const userId = req.userId;
  const sql = `SELECT jarId, jarName FROM jars WHERE userId = ?`;
  db.all(sql, [userId], (err, rows) => {
      if (err) {
          console.error('Error fetching user jars:', err);
          res.status(500).send('Failed to fetch user jars.');
      } else {
          res.json(rows);
      }
  });
});

// Route to serve view-notes.html and fetch jar details and notes
app.get('/view-notes', checkUserSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'view-notes.html'));
});

app.get('/get-jar-details', checkUserSession, (req, res) => {
  const { jarId } = req.query;
  const sql = `SELECT jarName, jarSummary, jarAccessDate FROM jars WHERE jarId = ? AND userId = ?`;
  db.get(sql, [jarId, req.userId], (err, jar) => {
      if (err) {
          console.error('Error fetching jar details:', err);
          res.status(500).send('Failed to fetch jar details.');
      } else {
          const sqlNotes = `SELECT noteName, noteSummary, noteCreated FROM notes WHERE jarId = ? ORDER BY noteCreated`;
          db.all(sqlNotes, [jarId], (err, notes) => {
              if (err) {
                  console.error('Error fetching notes:', err);
                  res.status(500).send('Failed to fetch notes.');
              } else {
                  res.json({ jar, notes });
              }
          });
      }
  });
});


/* Jar Fetch Route (Specific)
app.get('/jar-details/:jarId', (req, res) => {
    const userId = req.cookies.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized');
    }
  
    const jarId = req.params.jarId;
    const sql = `SELECT jarName, jarSummary, jarAccessDate FROM jars WHERE jarId = ? AND userId = ?`;
    db.get(sql, [jarId, userId], (err, row) => {
      if (err) {
        console.error('Error fetching jar details:', err);
        res.status(500).send('Failed to fetch jar details.');
      } else if (!row) {
        res.status(404).send('Jar not found.');
      } else {
        res.json(row);
      }
    });
});


// Create Note Route
app.post('/create-note', (req, res) => {
    const userId = req.cookies.userId;
    if (!userId) {
      return res.status(401).send('Unauthorized');
    }
  
    const { noteName, noteSummary, jarId } = req.body;

    // Generate a 6-digit random user ID
    const noteId = Math.floor(100000 + Math.random() * 900000);
    const noteCreated = new Date().toISOString(); // Get current date as ISO string
  
    // Insert new note data into the database
    const sql = `INSERT INTO notes (jarId, userId, noteId, noteName, noteSummary, noteCreated) 
                 VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [noteId, noteName, noteSummary, noteCreated, jarId], function(err) {
      if (err) {
        console.error('Error creating note:', err);
        res.status(500).send('Failed to create note.');
      } else {
        console.log('New note created:', noteId);
        res.sendStatus(200);
      }
    });
});
*/

