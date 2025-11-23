const express = require('express');
const app = express();
const dotenv = require('dotenv');
const cors = require('cors');
const bodyParser = require('body-parser');
dotenv.config();


const VoiceResponse = require("twilio").twiml.VoiceResponse;
const { jwt: { AccessToken } } = require("twilio");
const { VoiceGrant } = AccessToken;

const client = require("twilio")(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('Request body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// ---------------------------
// GENERATE TWILIO ACCESS TOKEN
// ---------------------------
app.get("/token", (req, res) => {
    console.log("🔑 Token request received");
    // Allow custom identity via query parameter, or use default
    const identity = req.query.identity || "user-support";
    console.log("  - Identity:", identity);

    const voiceGrant = new VoiceGrant({
        outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
        incomingAllow: true,
    });

    const token = new AccessToken(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_API_KEY,
        process.env.TWILIO_API_SECRET,
        { identity }
    );

    token.addGrant(voiceGrant);

    const jwtToken = token.toJwt();
    console.log("  - Token generated successfully");
    console.log("  - Token length:", jwtToken.length);
    console.log("  - Client identity:", identity);

    res.send({
        token: jwtToken,
        identity
    });
});

// ---------------------------
// INCOMING CALL → IVR
// ---------------------------
app.post("/incoming-call", (req, res) => {
    const twiml = new VoiceResponse();

    const gather = twiml.gather({
        numDigits: 1,
        action: "/handle-key",
    });

    gather.say("Welcome to the IVR system. Press 1 for support. Press 2 for sales.");

    res.type("text/xml");
    res.send(twiml.toString());
});

// MENU HANDLER
app.post("/handle-key", (req, res) => {
    const twiml = new VoiceResponse();
    const digit = req.body.Digits;

    console.log("=".repeat(50));
    console.log("🔢 IVR KEY PRESSED");
    console.log("=".repeat(50));
    console.log("Digit pressed:", digit);
    console.log("Request body:", JSON.stringify(req.body, null, 2));

    if (digit === "1") {
        twiml.say("Connecting to support. Please wait while we connect you to an agent.");
        // For trial accounts, connect to WebRTC client instead of dialing external number
        const dial = twiml.dial({
            timeout: 30, // Wait up to 30 seconds for client to answer
            action: "/call-status?department=support", // Handle call status after dial
        });
        // Connect to the WebRTC client using Client identity
        // The identity must match what's used in the token generation
        dial.client("user-support");
        console.log("✅ Connecting to WebRTC client: user-support");
    } else if (digit === "2") {
        twiml.say("Connecting to sales. Please wait while we connect you to a sales representative.");
        const dial = twiml.dial({
            timeout: 30,
            action: "/call-status?department=sales",
        });
        dial.client("user-sales");
        console.log("✅ Connecting to WebRTC client: user-sales");
    } else {
        twiml.say("Invalid choice. Please try again.");
        twiml.redirect("/incoming-call");
        console.log("❌ Invalid digit pressed:", digit);
    }

    const twimlXml = twiml.toString();
    console.log("Generated TwiML:", twimlXml);
    console.log("=".repeat(50));

    res.type("text/xml");
    res.send(twimlXml);
});

// ---------------------------
// OUTGOING CALL (Triggered in React)
// ---------------------------
app.post("/call", async (req, res) => {
    console.log("=".repeat(50));
    console.log("📞 OUTGOING CALL REQUEST RECEIVED");
    console.log("=".repeat(50));

    const { to } = req.body;

    console.log("📱 Call Details:");
    console.log("  - To:", to);
    console.log("  - From:", process.env.TWILIO_NUMBER);
    console.log("  - Timestamp:", new Date().toISOString());

    if (!to) {
        console.error("❌ Error: 'to' parameter is missing");
        return res.status(400).send({ error: "Missing 'to' parameter" });
    }

    if (!process.env.TWILIO_NUMBER) {
        console.error("❌ Error: TWILIO_NUMBER environment variable is not set");
        return res.status(500).send({ error: "Server configuration error: TWILIO_NUMBER not set" });
    }

    try {
        console.log("🔄 Creating Twilio call...");
        const call = await client.calls.create({
            to,
            from: process.env.TWILIO_NUMBER,
            url: "https://unfaintly-hideless-zuri.ngrok-free.dev/outgoing-ivr",
        });

        console.log("✅ Call created successfully!");
        console.log("  - Call SID:", call.sid);
        console.log("  - Status:", call.status);
        console.log("  - Direction:", call.direction);
        console.log("=".repeat(50));

        res.send({
            callSid: call.sid,
            status: call.status,
            direction: call.direction
        });
    } catch (err) {
        console.error("❌ Error creating call:");
        console.error("  - Message:", err.message);
        console.error("  - Code:", err.code);
        console.error("  - Stack:", err.stack);
        console.log("=".repeat(50));
        res.status(500).send({ error: err.message });
    }
});

// CALL STATUS HANDLER (for dial status)
app.post("/call-status", (req, res) => {
    const twiml = new VoiceResponse();
    const dialCallStatus = req.body.DialCallStatus;
    const dialCallDuration = req.body.DialCallDuration;
    const dialCallSid = req.body.DialCallSid;
    const department = req.query.department || "support";

    console.log("=".repeat(50));
    console.log("📞 CALL STATUS UPDATE");
    console.log("=".repeat(50));
    console.log("Dial Call Status:", dialCallStatus);
    console.log("Dial Call Duration:", dialCallDuration);
    console.log("Dial Call SID:", dialCallSid);
    console.log("Department:", department);
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    console.log("=".repeat(50));

    if (dialCallStatus === "completed" || dialCallStatus === "answered") {
        // Call was answered and completed
        if (dialCallDuration && parseInt(dialCallDuration) > 0) {
            twiml.say(`Thank you for calling. The call lasted ${dialCallDuration} seconds. Goodbye.`);
        } else {
            twiml.say("Thank you for calling. Goodbye.");
        }
    } else if (dialCallStatus === "no-answer") {
        twiml.say("Sorry, the agent did not answer. Please make sure the app is open and try again later.");
        console.log("⚠️ Client did not answer the call");
    } else if (dialCallStatus === "busy") {
        twiml.say("Sorry, the agent is busy at the moment. Please try again later.");
        console.log("⚠️ Client is busy");
    } else if (dialCallStatus === "failed") {
        twiml.say("The call could not be completed. Please make sure the app is open and registered, then try again.");
        console.log("❌ Call failed - client may not be registered");
    } else if (dialCallStatus === "canceled") {
        twiml.say("The call was canceled. Please try again.");
        console.log("⚠️ Call was canceled");
    } else {
        twiml.say("The call has ended. Thank you for calling.");
        console.log("ℹ️ Call ended with status:", dialCallStatus);
    }

    res.type("text/xml");
    res.send(twiml.toString());
});

// OUTGOING IVR FLOW
app.post("/outgoing-ivr", (req, res) => {
    console.log("=".repeat(50));
    console.log("📢 OUTGOING IVR FLOW TRIGGERED");
    console.log("=".repeat(50));
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    console.log("Request query:", JSON.stringify(req.query, null, 2));

    const twiml = new VoiceResponse();
    twiml.say("Hello! This is an outgoing call from your IVR.");

    const twimlXml = twiml.toString();
    console.log("Generated TwiML:", twimlXml);
    console.log("=".repeat(50));

    res.type("text/xml");
    res.send(twimlXml);
});




app.listen(process.env.PORT, () => {
    console.log(`Server is running on port http://localhost:${process.env.PORT}`);
});