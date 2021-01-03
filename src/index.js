const { logger } = require("./logger");
const readline = require("readline");
const { google } = require("googleapis")
const path = require("path")
const fs = require("fs")

const messageFileLocation = process.argv[2]
const subject = process.argv[3] || "Testsubject"
if (!messageFileLocation) {
    logger.error("MessageFileLocation missing. Cannot send mail.")
    return
}
if (!fs.existsSync(path.resolve(messageFileLocation))) {
    logger.error("MessageFile not found at: " + path.resolve(messageFileLocation))
    return
}

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time
const TOKEN_PATH = "token.json";
const SCOPES = ["https://www.googleapis.com/auth/gmail.compose"];

// Get new token and run callback with successful authentication
function getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
    });
    console.log("Authorize this app by visiting this url:", authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question("Enter the code from that page here: ", (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return logger.error("Error retrieving access token", err);
            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return logger.error(err);
                logger.info("Token stored to", TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
    });
}

// Authorize for callback with credentials
function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
    );

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getNewToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

function buildMessage() {
    if (!process.env.MAIL_RECIPIENT) {
        logger.error("Recipient missing. Cannot send mail.")
        return null
    }

    try {
        const messageFileContent = fs.readFileSync(path.resolve(messageFileLocation), "utf-8").split("\n").map(x => x + "<br/>")

        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        var messageParts = [
            'From: Sender test@test.de',
            'To: ' + process.env.MAIL_RECIPIENT,
            'Content-Type: text/html; charset=utf-8',
            'MIME-Version: 1.0',
            `Subject: ${utf8Subject}`,
            ''
        ];
        messageParts = messageParts.concat(messageFileContent)

        const message = messageParts.join('\n');
        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        return encodedMessage
    } catch (error) {
        logger.error("An error occured building the message.")
        logger.error(error)
        return null
    }
}

async function sendMail(auth) {
    const gmail = google.gmail({ version: "v1", auth });

    const encodedMessage = buildMessage()

    try {
        logger.info("Sending email with subject: " + subject)
        var res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMessage,
            },
        });
        logger.info(JSON.stringify(res.data));
        return res.data;
    } catch (error) {
        logger.error("An error occured sending the mail.")
        logger.error(error)
    }
}

// authorizing and take action
fs.readFile("credentials.json", (err, content) => {
    if (err) return logger.info("Error loading client secret file:", err);
    authorize(JSON.parse(content), sendMail);
})