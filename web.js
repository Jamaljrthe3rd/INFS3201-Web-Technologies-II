const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const business = require('./business.js');
const persistence = require('./persistence.js');

const app = express();
const handlebars = require('express-handlebars');

// Initialize database connection
async function initializeApp() {
    try {
        await persistence.connectDatabase();
    } catch (error) {
        console.error('❌ Failed to initialize database connection:', error);
        process.exit(1);
    }
}

// Initialize the application
initializeApp().then(() => {
    // Start the server after successful initialization
    const PORT = process.env.PORT || 3000; // Changed to port 3000
    
    // Remove all listeners on the server to prevent EADDRINUSE errors
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    
    const server = app.listen(PORT, '0.0.0.0');
    
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`❌ Port ${PORT} is already in use. Please close any other running instances.`);
            console.log('You can try killing the process using: lsof -i :3000 | grep LISTEN');
        } else {
            console.error('❌ Server error:', error);
        }
        process.exit(1);
    });
    
}).catch(error => {
    console.error('❌ Failed to start application:', error);
    if (error.stack) {
        console.error(error.stack);
    }
    process.exit(1);
});

// Enable logging of all requests
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`, req.body);
    next();
});

// Body parser configuration
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// View engine setup
app.set('views', __dirname + "/templates");
app.set('view engine', 'handlebars');
app.engine('handlebars', handlebars.engine());

// Login Page
app.get('/', (req, res) => {
    console.log('Rendering login page');
    res.render('login', { layout: undefined, message: req.query.message });
});

// Login POST route
app.post('/', async (req, res) => {
    console.log('\n=== Login Attempt ===');
    console.log('Request body:', req.body);
    console.log('Headers:', req.headers);
    
    let { username, password } = req.body;
    
    if (!username || !password) {
        console.log('❌ Missing credentials - Username:', !!username, 'Password:', !!password);
        return res.render('login', { 
            layout: undefined, 
            message: 'Please enter both username and password' 
        });
    }

    try {
        console.log('👤 Attempting login for user:', username);
        let userType = await business.checkLogin(username, password);
        console.log('🔑 Login check result:', userType);
        
        if (!userType) {
            console.log('❌ Login failed: Invalid credentials');
            return res.render('login', { 
                layout: undefined, 
                message: 'Invalid Username/Password' 
            });
        }

        if (userType === "inactive") {
            console.log('❌ Login failed: Account not activated');
            return res.render('login', { 
                layout: undefined, 
                message: 'Please activate your account' 
            });
        }

        // Get the full user details for the session
        console.log('📝 Getting user details for session...');
        const userDetails = await business.getUserDetails(username);
        console.log('👤 User details retrieved:', userDetails ? 'Success' : 'Failed');
        
        // Start a new session
        console.log('🔐 Starting new session...');
        const session = await business.startSession({
            username: username,
            UserType: userType
        });
        console.log('✅ Session created:', session);

        // Set the session cookie with secure flags
        res.cookie('CMS_Session', session.uuid, {
            expires: session.expiry,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // Secure in production
            sameSite: 'lax',
            path: '/'
        });
        console.log('🍪 Session cookie set');

        console.log('✅ Login successful. User type:', userType);
        // Redirect based on user type
        if (userType === "admin") {
            console.log('🔄 Redirecting to admin dashboard...');
            res.redirect("/admin");
        } else {
            console.log('🔄 Redirecting to standard dashboard...');
            res.redirect("/dashboard");
        }
    } catch (error) {
        console.error('❌ Login error:', error);
        console.error('Stack trace:', error.stack);
        res.render('login', { 
            layout: undefined, 
            message: 'An error occurred during login. Please try again.' 
        });
    }
});

// Middleware to check session
app.use(async (req, res, next) => {
    let sessionID = req.cookies.CMS_Session;
    if (!sessionID) {
        return next();
    }
    
    let sessionData = await business.getSessionData(sessionID);
    if (sessionData) {
        // Make sure we're using the correct property names
        req.user = sessionData.username; // Match the property name used in startSession
        req.userType = sessionData.UserType;
    }
    next();
});

// Admin
app.get('/admin', async (req, res) => {
    let sessionKey = req.cookies.CMS_Session;
    if (!sessionKey) {
        return res.redirect("/?message=Not logged in");
    }

    let sessionData = await business.getSessionData(sessionKey);
    if (!sessionData || sessionData.UserType !== "admin") {
        return res.redirect("/?message=Unauthorized");
    }

    let users = await business.getAllUsers(); // ✅ Fetch users from DB
    res.render("admin_dashboard", { username: sessionData.UserName, users });
});


// ✅ Route to Activate Users
app.post('/admin/activate', async (req, res) => {
    if (!req.user || req.userType !== "admin") {
        return res.redirect("/?message=Unauthorized");
    }

    let { email } = req.body;
    await business.activateUser(email); // ✅ Activate user
    res.redirect("/admin");
});

//Standard user 
app.get('/dashboard', async (req, res) => {
    let sessionKey = req.cookies.CMS_Session;
    if (!sessionKey) {
        return res.redirect("/?message=Not logged in");
    }

    let sessionData = await business.getSessionData(sessionKey);
    if (!sessionData || sessionData.UserType !== "student") {
        return res.redirect("/?message=Unauthorized");
    }

    let courses = await business.getStudentCourses(sessionData.UserName); // ✅ Fetch courses
    res.render("standard_dashboard", { username: sessionData.UserName, courses });
});


// Course Management Access
app.get('/course-management', async (req, res) => {
    let sessionKey = req.cookies.CMS_Session; // ✅ Changed from "lab7session"
    if (!sessionKey) {
        res.redirect("/?message=Not logged in");
        return;
    }

    let sessionData = await business.getSessionData(sessionKey);
    if (!sessionData) {
        res.redirect("/?message=Not logged in");
        return;
    }

    res.render('course_management', { layout: undefined, username: sessionData.UserName });
});

// Register
app.get('/register', (req, res) => res.render('register', { layout: undefined, message: req.query.message }));

app.post('/register', async (req, res) => {
    let { username, email, password, repeatPassword } = req.body;

    if (!username || !email || !password || !repeatPassword) {
        res.redirect('/register?message=All fields are required');
        return;
    }

    if (password !== repeatPassword) {
        res.redirect('/register?message=Passwords do not match');
        return;
    }

    let result = await business.createUser(username, password, email);
    if (!result.success) {
        res.redirect('/register?message=' + encodeURIComponent(result.message));
        return;
    }

    res.redirect('/?message=Check console for activation code');
});

// Verification
app.get('/verify', (req, res) => res.render('verify', { layout: undefined }));

app.post('/verify', async (req, res) => {
    let { email, activationCode } = req.body;
    let success = await business.verifyUser(email, activationCode);
    res.redirect(success ? '/?message=Account activated successfully' : '/verify?message=Invalid activation code');
});

// Forgot Password (GET)
app.get('/forgot-password', (req, res) => res.render('forgot-password', { layout: undefined, message: req.query.message }));

// Forgot Password (POST)
app.post('/forgot-password', async (req, res) => {
    let { email } = req.body;

    if (!email) {
        res.redirect('/forgot-password?message=Please enter your email');
        return;
    }

    let user = await business.getUserByEmail(email);
    if (!user) {
        res.redirect('/forgot-password?message=This email is not registered');
        return;
    }

    console.log(`Password reset requested for ${email}`);
    res.redirect('/forgot-password?message=A password reset email has been sent');
});

// Logout
app.get('/logout', async (req, res) => {
    let sessionKey = req.cookies.CMS_Session; // ✅ Changed from "lab7session"

    if (sessionKey) {
        await business.deleteSession(sessionKey);
        res.clearCookie('CMS_Session'); // ✅ Changed from "lab7session"
    }

    res.redirect('/?message=Logged out successfully');
});

// ✅ FIXED: Submit Request
app.post("/submit-request", async (req, res) => {
    if (!req.user) {
        return res.redirect("/?message=Not logged in");
    }

    await business.submitRequest(req.user, req.body.category, req.body.details); // ✅ FIXED: Use business layer
    res.redirect("/course-management");
});

// ✅ FIXED: HoD Request View
app.get("/hod/requests", async (req, res) => {
    if (!req.user || req.userType !== "hod") {
        return res.redirect("/?message=Unauthorized");
    }

    let requests = await business.getAllRequests(); // ✅ FIXED: Use business layer
    res.render("hod-requests", { requests });
});

// ✅ FIXED: HoD Process Request
app.post("/hod/process", async (req, res) => {
    if (!req.user || req.userType !== "hod") {
        return res.redirect("/?message=Unauthorized");
    }

    await business.processRequest(req.body.requestID, req.body.action); // ✅ FIXED: Use business layer
    res.redirect("/hod/requests");
});

// Public route for viewing feeding sites
app.get('/feeding-sites', async (req, res) => {
    try {
        const sites = await persistence.getAllFeedingSites();
        res.render('feeding-sites', { 
            layout: 'main',
            sites,
            user: req.user,
            helpers: {
                formatDate: function(date) {
                    return new Date(date).toLocaleDateString();
                }
            }
        });
    } catch (error) {
        console.error('Error fetching feeding sites:', error);
        res.status(500).send('Error loading feeding sites');
    }
});

// Port configuration and server listening
const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
