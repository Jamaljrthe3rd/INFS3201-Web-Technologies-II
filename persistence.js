const mongodb = require('mongodb');
const crypto = require('crypto');  // SHA-256 for hashing

let client;
let db;
let users;
let sessions;
let requests;
let feedingSites;  // New collection for feeding sites

// Database Connection with Collection Setup
async function connectDatabase() {
    if (!client) {
        try {
            client = new mongodb.MongoClient('mongodb+srv://khaled:12class34@cluster0.6hhnfdx.mongodb.net/');
            db = client.db('CMS_db');
            
            // Get or create collections
            users = db.collection('Users');
            sessions = db.collection('Sessions');
            requests = db.collection('Requests');
            feedingSites = db.collection('FeedingSites');
            
            // Create indexes if they don't exist
            await users.createIndex({ UserName: 1 }, { unique: true });
            await users.createIndex({ Email: 1 }, { unique: true });
            
            // Create session index with TTL
            await sessions.createIndex(
                { sessionToken: 1 },
                { unique: true }
            );
            await sessions.createIndex(
                { createdAt: 1 },
                { expireAfterSeconds: 300 } // 5 minutes TTL
            );

            // Create geospatial index for feeding sites
            await feedingSites.createIndex({ location: "2dsphere" });

            // Insert default admin if not exists
            const adminExists = await users.findOne({ UserType: 'admin' });
            if (!adminExists) {
                // Create admin with password 'admin123'
                const adminPassword = 'admin123';
                let hash = crypto.createHash('sha256');
                hash.update(adminPassword);
                let hashedPassword = hash.digest('hex');
                
                await users.insertOne({
                    UserName: 'admin',
                    Email: 'admin@cms.com',
                    Password: hashedPassword,
                    UserType: 'admin',
                    Active: true,
                    CreatedAt: new Date()
                });
            }

            // Insert sample feeding sites if none exist
            const sitesExist = await feedingSites.findOne({});
            if (!sitesExist) {
                await feedingSites.insertMany([
                    {
                        name: "Qatar University Campus",
                        location: {
                            type: "Point",
                            coordinates: [51.4904, 25.3755]
                        },
                        description: "Feeding station near the main library",
                        lastVisit: new Date(),
                        foodLevel: "Medium",
                        waterLevel: "High",
                        catCount: 5
                    },
                    {
                        name: "Katara Cultural Village",
                        location: {
                            type: "Point",
                            coordinates: [51.5259, 25.3594]
                        },
                        description: "Feeding area near the amphitheater",
                        lastVisit: new Date(),
                        foodLevel: "Low",
                        waterLevel: "Medium",
                        catCount: 3
                    }
                ]);
            }

            
        } catch (error) {
            console.error('❌ Database connection error:', error);
            throw error;
        }
    }
    return client;
}

// Function to Hash Passwords using SHA-256
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// User Registration
async function createUser(username, hashedPassword, email, activationCode, userType, isActive) {
    await connectDatabase();
    let user = {
        UserName: username,
        Password: hashedPassword,
        Email: email,
        ActivationCode: activationCode,
        UserType: userType,
        Active: isActive,
        CreatedAt: new Date()
    };

    await users.insertOne(user);
    console.log(`User registered: ${username} (${userType})`);
}

// User Verification
async function verifyUser(email, activationCode) {
    await connectDatabase();
    let user = await users.findOne({ Email: email, ActivationCode: activationCode });

    if (user) {
        await users.updateOne({ Email: email }, { 
            $set: { Active: true }, 
            $unset: { ActivationCode: "" } // ✅ Remove activation code after verification
        });

        console.log(`User ${email} is now verified and active.`);
        return true;
    }
    return false;
}

// Retrieve User Data
async function getUserByUsernameOrEmail(username, email) {
    await connectDatabase();
    return await users.findOne({ $or: [{ UserName: username }, { Email: email }] });
}

async function getUserDetails(username) {
    console.log('Getting user details for:', username);
    try {
        await connectDatabase();
        const result = await users.findOne({ 
            UserName: { 
                $regex: new RegExp(`^${username}$`, 'i') 
            } 
        });
        console.log('Database query result:', result ? 'User found' : 'No user found');
        if (result) {
            console.log('Found user type:', result.UserType);
        }
        return result;
    } catch (error) {
        console.error('Error getting user details:', error);
        throw error;
    }
}

async function getUserByEmail(email) {
    await connectDatabase();
    return await users.findOne({ Email: email });
}

// Admin
async function getAllUsers() {
    await connectDatabase();
    return await users.find({}, { projection: { Password: 0 } }).toArray(); // ✅ Hide password field
}

async function activateUser(email) {
    await connectDatabase();
    let result = await users.updateOne({ Email: email }, { $set: { Active: true } });

    if (result.modifiedCount > 0) {
        console.log(`✅ User ${email} activated successfully.`);
        return true;
    } else {
        console.log(`❌ User activation failed for ${email}.`);
        return false;
    }
}

// Standard
async function getStudentCourses(username) {
    await connectDatabase();
    let student = await users.findOne({ UserName: username });

    if (!student) {
        return [];
    }

    return student.Courses || [];
}

// In business.js, modify startSession
async function startSession(data) {
    let uuid = crypto.randomUUID();
    // Make sure data contains both username and UserType
    await persistence.storeSession(uuid, data.username, data.UserType); // Pass the userType to persistence
    return {
        uuid: uuid,
        expiry: new Date(Date.now() + 5 * 60 * 1000)
    };
}

// Session Management
async function storeSession(sessionId, username, userType) {
    await connectDatabase();
    const session = {
        sessionToken: sessionId,
        userName: username,
        UserType: userType,
        createdAt: new Date(),
        lastAccess: new Date()
    };
    
    try {
        await sessions.insertOne(session);
        console.log('Session stored for user:', username);
        return true;
    } catch (error) {
        console.error('Error storing session:', error);
        return false;
    }
}

async function getSession(sessionId) {
    await connectDatabase();
    try {
        const session = await sessions.findOne({ sessionToken: sessionId });
        if (session) {
            // Update last access time
            await sessions.updateOne(
                { sessionToken: sessionId },
                { $set: { lastAccess: new Date() } }
            );
        }
        return session;
    } catch (error) {
        console.error('Error retrieving session:', error);
        return null;
    }
}

// Function to clear expired sessions
async function clearExpiredSessions() {
    await connectDatabase();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    try {
        await sessions.deleteMany({ createdAt: { $lt: fiveMinutesAgo } });
    } catch (error) {
        console.error('Error clearing expired sessions:', error);
    }
}

// Request Handling - Submitting a Request
async function submitRequest(username, category, details) {
    await connectDatabase();
    let estimatedTime = await calculateEstimatedTime(category);
    await requests.insertOne({ 
        username, 
        category, 
        details, 
        status: "pending", 
        createdAt: new Date(), 
        estimatedCompletion: estimatedTime 
    });
    console.log("Request submitted:", { username, category, details, estimatedTime });
}

// Fetch All Pending Requests
async function getAllRequests() {
    await connectDatabase();
    return await requests.find({ status: "pending" }).toArray();
}

// Process a Request (Approved/Rejected)
async function processRequest(requestID, action) {
    await connectDatabase();
    await requests.updateOne(
        { _id: new mongodb.ObjectId(requestID) }, 
        { $set: { status: action, processedAt: new Date() } }
    );
    console.log("Request processed:", { requestID, action });
}

// Function to Estimate Processing Time
async function calculateEstimatedTime(category) {
    await connectDatabase();
    let queueSize = await requests.countDocuments({ category, status: "pending" });
    let processingTimePerRequest = 15; // Assume 15 minutes per request
    let estimatedCompletionTime = new Date(Date.now() + queueSize * processingTimePerRequest * 60000);
    return estimatedCompletionTime;
}

// Feeding Sites Management
async function addFeedingSite(name, coordinates, description) {
    await connectDatabase();
    let site = {
        name: name,
        location: {
            type: "Point",
            coordinates: coordinates
        },
        description: description,
        lastVisit: new Date(),
        foodLevel: "Unknown",
        waterLevel: "Unknown",
        catCount: 0
    };

    await feedingSites.insertOne(site);
    console.log(`Feeding site added: ${name}`);
}

async function getFeedingSites() {
    await connectDatabase();
    return await feedingSites.find().toArray();
}

async function updateFeedingSite(siteId, updateData) {
    await connectDatabase();
    await feedingSites.updateOne(
        { _id: new mongodb.ObjectId(siteId) },
        { $set: updateData }
    );
    console.log(`Feeding site updated: ${siteId}`);
}

// Get all feeding sites
async function getAllFeedingSites() {
    return await feedingSites.find({}).toArray();
}

// Get a single feeding site by ID
async function getFeedingSiteById(id) {
    return await feedingSites.findOne({ _id: new mongodb.ObjectId(id) });
}

// Delete a session by ID
async function deleteSession(sessionId) {
    await connectDatabase();
    try {
        await sessions.deleteOne({ sessionToken: sessionId });
        console.log('Session deleted:', sessionId);
        return true;
    } catch (error) {
        console.error('Error deleting session:', error);
        return false;
    }
}

// Export All Functions
module.exports = {
    connectDatabase,
    getUserDetails,
    storeSession,
    getSession,
    clearExpiredSessions,
    createUser,
    verifyUser,
    getUserByEmail,
    getUserByUsernameOrEmail,
    submitRequest,
    getAllRequests,
    processRequest,
    getAllUsers,
    activateUser,
    getStudentCourses,
    addFeedingSite,
    getFeedingSites,
    updateFeedingSite,
    getAllFeedingSites,
    getFeedingSiteById,
    deleteSession
};
