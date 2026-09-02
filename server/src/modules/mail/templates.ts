import { clientUrl } from '../../common/client-url';
/**
 * Email markup, kept deliberately plain.
 *
 * Inline styles and table-free layout because mail clients strip <style> blocks and
 * Outlook renders modern CSS unpredictably. Every message also ships a text version,
 * which is what most spam filters actually read.
 */

const NAVY = '#0B2952';
const GOLD = '#F0A93B';
const INK = '#070D1B';
const MUTED = '#5A6780';

function shell(heading: string, body: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#F4F6FA;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid rgba(11,41,82,0.10);">
      <div style="background:${NAVY};padding:22px 28px;">
        <span style="color:#ffffff;font-size:19px;font-weight:800;letter-spacing:-0.02em;">Reelink</span>
        <span style="color:${GOLD};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;display:block;margin-top:4px;">List. Create. Reel. Connect.</span>
      </div>
      <div style="padding:30px 28px;">
        <h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;color:${INK};">${heading}</h1>
        ${body}
      </div>
      <div style="padding:16px 28px 22px;border-top:1px solid rgba(11,41,82,0.08);">
        <p style="margin:0;font-size:11.5px;line-height:1.6;color:${MUTED};">
          You received this because someone used this address on Reelink.
        </p>
      </div>
    </div>
  </body>
</html>`;
}

function button(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:${GOLD};color:${INK};font-weight:700;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:10px;">${label}</a>`;
}

const p = (text: string) =>
  `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${MUTED};">${text}</p>`;

export function passwordResetEmail(name: string, url: string, minutes: number) {
  const html = shell(
    'Reset your password',
    [
      p(`Hi ${escapeHtml(name)}, we got a request to reset the password on your Reelink account.`),
      `<div style="margin:22px 0;">${button(url, 'Choose a new password')}</div>`,
      p(`This link works once and expires in ${minutes} minutes.`),
      p(
        `If you didn't ask for this, you can ignore this email — your password stays as it is.`,
      ),
      `<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:${MUTED};word-break:break-all;">Button not working? Paste this into your browser:<br><span style="color:${NAVY};">${url}</span></p>`,
    ].join(''),
  );

  const text = [
    `Hi ${name},`,
    ``,
    `We got a request to reset the password on your Reelink account.`,
    `Open this link to choose a new one — it works once and expires in ${minutes} minutes:`,
    ``,
    url,
    ``,
    `If you didn't ask for this, ignore this email; your password stays as it is.`,
    ``,
    `— Reelink`,
  ].join('\n');

  return { subject: 'Reset your Reelink password', html, text };
}

export function passwordChangedEmail(name: string) {
  const html = shell(
    'Your password was changed',
    [
      p(`Hi ${escapeHtml(name)}, your Reelink password was just changed.`),
      p(
        `If that was you, nothing else to do. If it wasn't, reset your password immediately and check who has access to your email account.`,
      ),
    ].join(''),
  );

  const text = [
    `Hi ${name},`,
    ``,
    `Your Reelink password was just changed.`,
    `If that wasn't you, reset it immediately and check who has access to your email.`,
    ``,
    `— Reelink`,
  ].join('\n');

  return { subject: 'Your Reelink password was changed', html, text };
}

export function newMessageEmail(input: {
  recipientName: string;
  senderName: string;
  propertyTitle?: string;
  preview: string;
  url: string;
}) {
  const { recipientName, senderName, propertyTitle, preview, url } = input;
  const about = propertyTitle ? ` about ${escapeHtml(propertyTitle)}` : '';

  const html = shell(
    `${escapeHtml(senderName)} sent you a message`,
    [
      p(`Hi ${escapeHtml(recipientName)}, you have a new enquiry${about} on Reelink.`),
      `<blockquote style="margin:0 0 18px;padding:14px 16px;background:#F4F6FA;border-left:3px solid ${GOLD};border-radius:0 8px 8px 0;font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(preview)}</blockquote>`,
      `<div style="margin:22px 0;">${button(url, 'Reply on Reelink')}</div>`,
      p(`We only email you when you're offline — reply in the app and this stops.`),
    ].join(''),
  );

  const text = [
    `Hi ${recipientName},`,
    ``,
    `${senderName} sent you a message${propertyTitle ? ` about ${propertyTitle}` : ''} on Reelink:`,
    ``,
    `  "${preview}"`,
    ``,
    `Reply here: ${url}`,
    ``,
    `We only email you when you're offline.`,
    ``,
    `— Reelink`,
  ].join('\n');

  return {
    subject: `${senderName} sent you a message${propertyTitle ? ` about ${propertyTitle}` : ''}`,
    html,
    text,
  };
}

/** Names come from user input and land inside HTML, so they get escaped. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The six-digit verification code.
 *
 * The code is set large and monospaced with letter-spacing because people read these
 * off one screen and type them into another — grouping and size are what stop a 6 being
 * read as an 8. No link and no button: there is nothing here to click, so there is
 * nothing for a phishing lookalike to imitate.
 */
export function verifyEmailCode(name: string, code: string, minutes: number) {
  const html = shell(
    'Confirm your email',
    [
      p(`Hi ${escapeHtml(name)}, enter this code in Reelink to confirm your email address.`),
      `<div style="margin:26px 0;text-align:center;">
         <div style="display:inline-block;padding:18px 28px;border-radius:14px;background:#F6F8FB;border:1px solid #E2E8F2;">
           <span style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${NAVY};">${escapeHtml(code)}</span>
         </div>
       </div>`,
      p(`The code expires in ${minutes} minutes and can only be used once.`),
      p(
        `If you didn't ask to verify this address, you can ignore this email — nothing changes on your account.`,
      ),
      `<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:${MUTED};">Reelink will never ask you for this code by phone, chat or email reply.</p>`,
    ].join(''),
  );

  const text = [
    `Hi ${name},`,
    ``,
    `Your Reelink verification code is: ${code}`,
    ``,
    `Enter it in Settings to confirm your email address. It expires in ${minutes} minutes and works once.`,
    ``,
    `If you didn't ask to verify this address, ignore this email — nothing changes.`,
    `Reelink will never ask you for this code by phone, chat or email reply.`,
    ``,
    `— Reelink`,
  ].join('\n');

  return { subject: `${code} is your Reelink verification code`, html, text };
}

/**
 * Sent to staff when the automated check hides something.
 *
 * The point of this message is that it arrives when nobody is signed in, so it carries
 * enough to judge urgency from the inbox alone: who posted it, what it was called, and
 * the model's reason. The item is already hidden from buyers by the time this is sent,
 * so it is a prompt to review rather than an alarm to act on immediately.
 */
export function flaggedListingEmail(input: {
  adminName: string;
  agentName: string;
  kind: string;
  title: string;
  reason: string;
}) {
  const url = `${clientUrl()}/admin`;

  const html = shell(
    `A ${input.kind} was flagged for review`,
    `${p(`Hi ${input.adminName}, the automated check did not think this looks like a property listing, so it is hidden from buyers until you decide.`)}
     <div style="margin:0 0 18px;padding:16px 18px;background:#F4F6FA;border-radius:10px;border:1px solid rgba(11,41,82,0.08);">
       <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:${INK};">${input.title}</p>
       <p style="margin:0 0 10px;font-size:13px;color:${MUTED};">Posted by ${input.agentName}</p>
       <p style="margin:0;font-size:14px;line-height:1.6;color:${INK};">${input.reason}</p>
     </div>
     ${p('The check is deliberately cautious and does get this wrong — vacant lots and unfinished builds are the usual false alarms. Nothing has been deleted.')}
     ${button(url, 'Open the admin panel')}`,
  );

  const text = `A ${input.kind} was flagged for review

"${input.title}" — posted by ${input.agentName}
Reason: ${input.reason}

It is hidden from buyers until you decide. Nothing has been deleted.
Review it: ${url}`;

  return { subject: `Reelink: a ${input.kind} needs review`, html, text };
}
