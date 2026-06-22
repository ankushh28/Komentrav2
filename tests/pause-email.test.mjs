import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAutomationPauseEmail } from '../lib/email.js';

test('renders a responsive pause email with escaped content and fallbacks', () => {
  const email = renderAutomationPauseEmail({
    scope: 'account',
    automationName: '<Wallet & Links>',
    instagramUsername: 'creator',
    affectedAutomationCount: 3,
    reason: '<script>alert(1)</script>',
    resumeAtLabel: '22 Jun 2026, 2:07 pm IST',
    canReset: true,
    postPermalink: 'https://instagram.com/p/example',
    postThumbnail: 'javascript:alert(1)',
    dashboardUrl: 'https://komentra.tech/dashboard?workspaceId=one&automationId=two',
  });

  assert.match(email.subject, /automations paused/);
  assert.match(email.html, /@media only screen/);
  assert.match(email.html, /&lt;Wallet &amp; Links&gt;/);
  assert.doesNotMatch(email.html, /<script>alert/);
  assert.doesNotMatch(email.html, /javascript:/);
  assert.match(email.text, /Comments skipped while paused are not replayed/);
  assert.match(email.text, /Review automation: https:\/\/komentra\.tech/);
});

test('omits post UI when an automation has no post', () => {
  const email = renderAutomationPauseEmail({
    scope: 'automation',
    automationName: 'DM reply',
    reason: 'Temporary safety pause',
    dashboardUrl: 'https://komentra.tech/dashboard',
  });
  assert.doesNotMatch(email.html, /View the affected post/);
  assert.match(email.text, /This pause affects only this automation/);
});
