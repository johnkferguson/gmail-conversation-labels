/**
 * Gmail Smart Labeller — error reporting.
 *
 * `sendErrorEmail` is a throttled wrapper around MailApp.sendEmail. Apps
 * Script triggers retry on failure, so a single broken config or transient
 * Gmail outage can otherwise generate dozens of identical error emails per
 * hour. The throttle uses PropertiesService to record the last-sent timestamp
 * across trigger invocations.
 */

const LAST_ERROR_EMAIL_KEY = "lastErrorEmailTimestamp";

/**
 * @param {string} subject
 * @param {string} body
 */
function sendErrorEmail(subject, body) {
  if (!CONFIG.debug.sendErrorEmails) return;

  const throttleHours = CONFIG.debug.errorEmailThrottleHours ?? 1;
  const throttleMs = throttleHours * 60 * 60 * 1000;
  const props = PropertiesService.getUserProperties();
  const lastSentStr = props.getProperty(LAST_ERROR_EMAIL_KEY);
  const lastSent = lastSentStr ? Number.parseInt(lastSentStr, 10) : 0;

  if (Date.now() - lastSent < throttleMs) {
    Logger.log(
      `Error email throttled (next allowed in ${Math.ceil(
        (throttleMs - (Date.now() - lastSent)) / 60000
      )}m): ${subject}`
    );
    return;
  }

  MailApp.sendEmail(CONFIG.userEmail, subject, body);
  props.setProperty(LAST_ERROR_EMAIL_KEY, String(Date.now()));
}
