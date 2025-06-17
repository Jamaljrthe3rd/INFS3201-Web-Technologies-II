const persistence = require("./persistence.js");
const crypto = require("crypto");

// Check user login with SHA-256 hashing
async function checkLogin(username, password) {
    console.log('\n=== Login Check ===');
    console.log('🔍 Checking login for username:', username);
    
    if (!username || !password) {
        console.log('❌ Missing username or password');
        return undefined;
    }

    try {
        console.log('📝 Fetching user details from database...');
        let details = await persistence.getUserDetails(username);
        console.log('👤 User found in database:', details ? 'Yes' : 'No');

        if (!details) {
            console.log('❌ No user found with username:', username);
            return undefined;
        }

        // Hash the input password for comparison
        console.log('🔒 Hashing input password...');
        let hash = crypto.createHash('sha256');
        hash.update(password);
        let hashedPassword = hash.digest('hex');
        console.log('📝 Password comparison:');
        console.log('Input hash (first 10 chars):', hashedPassword.substring(0, 10));
        console.log('Stored hash (first 10 chars):', details.Password.substring(0, 10));

        // Compare stored password hash with the computed hash
        if (details.Password !== hashedPassword) {
            console.log('❌ Password mismatch');
            return undefined;
        }

        // Check if user is active (verified)
        if (!details.Active) {
            console.log('⚠️ User account is not active');
            return "inactive";
        }
        
        console.log('✅ Login successful');
        console.log('👤 User type:', details.UserType);
        return details.UserType;  // Return user role
    } catch (error) {
        console.error('❌ Error in checkLogin:', error);
        console.error('Stack trace:', error.stack);
        throw error;
    }
}

// Create a new user
async function createUser(username, password, email, userType = "student") {
    let existingUser = await persistence.getUserByUsernameOrEmail(username, email);

    if (existingUser) {
        return { success: false, message: "Username or email already exists" };
    }

    let activationCode = userType === "admin" ? null : crypto.randomUUID(); // ✅ Admins don’t need activation codes

    let hash = crypto.createHash('sha256');
    hash.update(password);
    let hashedPassword = hash.digest('hex');

    let isActive = userType === "admin" ? true : false; // ✅ Admins are automatically active

    await persistence.createUser(username, hashedPassword, email, activationCode, userType, isActive);

    console.log(`Activation code for ${email}: ${activationCode}`);

    return { success: true, activationCode };
}

// Verify a user using email and activation code
async function verifyUser(email, activationCode) {
    return await persistence.verifyUser(email, activationCode);
}

// Get user by email
async function getUserByEmail(email) {
    return await persistence.getUserByEmail(email);
}

// admin
async function getAllUsers() {
    return await persistence.getAllUsers();
}
async function activateUser(email) {
    return await persistence.activateUser(email);
}

// standard
async function getStudentCourses(username) {
    return await persistence.getStudentCourses(username);
}

// Start a session for the user (5-minute expiration)
async function startSession(data) {
    let uuid = crypto.randomUUID();
    // Make sure data contains both username and UserType
    await persistence.storeSession(uuid, data.username, data.UserType); // Pass the userType to persistence
    return {
        uuid: uuid,
        expiry: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes in milliseconds
    };
}

// Retrieve session data
async function getSessionData(key) {
    try {
        console.log('🔑 Retrieving session data for key:', key);
        const session = await persistence.getSession(key);
        console.log('📋 Session data retrieved:', session ? 'Found' : 'Not found');
        return session;
    } catch (error) {
        console.error('❌ Error retrieving session data:', error);
        throw error;
    }
}

// Delete session (logout)
async function deleteSession(key) {
    try {
        console.log('🚪 Logging out session:', key);
        const result = await persistence.deleteSession(key);
        console.log('✅ Session deleted successfully');
        return result;
    } catch (error) {
        console.error('❌ Error deleting session:', error);
        throw error;
    }
}

module.exports = {
    checkLogin,
    createUser,
    startSession,
    getSessionData,
    deleteSession,
    verifyUser,
    getUserByEmail,
    getAllUsers,
    activateUser,
    getStudentCourses,
    getUserDetails: persistence.getUserDetails  // Added this line to expose the persistence function
};