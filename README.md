# Gmail Smart Labeller

A Google Apps Script application that automatically labels your Gmail threads as:

- **Inbound**: Emails sent to you
- **Outbound**: Emails sent by you
- **Conversation**: Back-and-forth email exchanges

## Features

- Automatically processes new emails as they arrive
- Can be run on existing emails to label your entire inbox
- Configurable polling interval and search parameters
- Minimal setup required

## Setup Instructions

1. Clone this repository
2. Copy `src/config.template.js` to `src/config.js` and update with your settings
3. Copy `.clasp-example.json` to `.clasp.json` and update with your Google Apps Script project ID
4. Deploy to Google Apps Script using clasp:

   ```bash
   npm install -g @google/clasp
   clasp login
   clasp push
   ```

5. In the Google Apps Script editor, run the following functions in order:
   - `setup()` - Creates necessary Gmail labels and sets up time-based trigger
   - `processHistorical()` (Optional) - Labels existing emails

## Configuration

Edit the `config.js` file to customize:

- Your email address
- Label names
- Polling interval
- Search query parameters
- Debug options

## Manual Functions

- `manualRun()` - Run the labeler manually without waiting for the trigger
- `resetCache()` - Reset thread cache and tracking information
- `cleanupCache()` - Clean up old cached thread records to avoid hitting storage limits

## License

This project is licensed under the [MIT License](LICENSE).
