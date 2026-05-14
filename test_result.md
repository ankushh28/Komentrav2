#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Instagram Comment Automation SaaS MVP.
  Users sign up / log in (JWT + bcrypt), connect their Instagram Business account via Meta OAuth,
  pick a post + a trigger keyword, and create an automation that auto-replies to comments
  and DMs commenters when the trigger word is detected. Webhook receives Instagram comment
  events and processes them inline (no queues).

backend:
  - task: "Auth - signup/login/me with JWT + bcrypt"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "POST /api/auth/signup, POST /api/auth/login, GET /api/auth/me implemented. Passwords hashed with bcryptjs, JWT issued with jsonwebtoken (30d). Stored in MongoDB 'users' collection with UUID _id."
        - working: true
          agent: "testing"
          comment: "Tested all auth endpoints: signup (valid, duplicate email, missing fields), login (valid, wrong password, unknown email), me (with/without token). All scenarios working correctly. Returns proper 200/400/401 status codes with expected responses."
  - task: "Instagram OAuth connect + callback"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /api/instagram/connect (auth required) returns Instagram Business Login URL with required scopes. GET /api/instagram/callback exchanges code -> short-lived -> long-lived token, fetches /me, upserts into instagram_accounts, subscribes app to comments+messages webhooks, redirects to /?ig=success."
        - working: true
          agent: "testing"
          comment: "Tested /api/instagram/connect endpoint. Returns proper Instagram OAuth URL with correct client_id (2039339197018623) and required scopes (instagram_business_basic, manage_messages, manage_comments, content_publish). Auth protection working (401 without token). Callback flow not testable without real OAuth but endpoint structure is correct."
  - task: "Instagram accounts list/disconnect, media list"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /api/instagram/accounts, DELETE /api/instagram/accounts/:id, GET /api/instagram/media?accountId= (proxies Graph API)."
        - working: true
          agent: "testing"
          comment: "Tested /api/instagram/accounts (returns empty array correctly), /api/instagram/media with nonexistent accountId (returns 404 'Account not found' as expected). Auth protection working. Endpoints functioning correctly."
  - task: "Automations CRUD"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "POST/GET /api/automations, PUT/DELETE /api/automations/:id. Fields: userId, instagramAccountId, postId, triggerWord, replyMessage, dmMessage, isActive. UUID _id."
        - working: true
          agent: "testing"
          comment: "Tested full CRUD lifecycle: CREATE (returns automation with UUID _id and isActive:true), LIST (returns array with created automation), UPDATE isActive to false (working), UPDATE replyMessage (working), DELETE (returns success:true), LIST again (automation removed). Auth protection working (401 without token). All operations functioning correctly."
  - task: "Webhook GET verify + POST event handler"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /api/webhook validates hub.mode/hub.verify_token/hub.challenge against WEBHOOK_VERIFY_TOKEN. POST /api/webhook stores event, matches comments to active automations by instagramAccountId + postId + triggerWord, then posts reply + DM via Instagram Graph API."
        - working: true
          agent: "testing"
          comment: "Tested webhook verify: GET with correct verify_token returns plain text challenge '12345' (200), wrong token returns 403 'forbidden'. Tested webhook event: POST with sample Instagram comment payload returns 200 'EVENT_RECEIVED' (correctly acknowledges even when no matching account/automation found). Both endpoints working correctly."

frontend:
  - task: "Auth + Dashboard + Create Automation modal"
    implemented: true
    working: "NA"
    file: "app/page.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Single-page app with login/signup, dashboard listing connected IG accounts + automations with toggle/delete, Connect Instagram button, Create Automation dialog with account picker -> media grid -> trigger/reply/DM fields."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 0
  run_ui: false

test_plan:
  current_focus:
    - "Auth - signup/login/me with JWT + bcrypt"
    - "Instagram OAuth connect + callback"
    - "Automations CRUD"
    - "Webhook GET verify + POST event handler"
    - "Instagram accounts list/disconnect, media list"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: |
        Backend implemented as a single Next.js dynamic route /api/[[...path]]/route.js dispatching to handlers.
        Key things for testing agent:
        - Base URL: process.env.NEXT_PUBLIC_BASE_URL (use the configured preview URL)
        - Auth uses Bearer token in Authorization header
        - For Instagram OAuth / media / disconnect endpoints, no real Instagram token will be available in the test env -
          please test that the endpoint returns the expected auth URL for /api/instagram/connect (just the URL contains
          api.instagram.com/oauth/authorize and correct client_id), and that protected routes return 401 without token.
        - For webhook GET verify: /api/webhook?hub.mode=subscribe&hub.verify_token=test&hub.challenge=12345 should return body "12345".
        - For webhook POST: posting a sample Instagram comment payload should return 200 "EVENT_RECEIVED" even if no matching account/automation.
        - Automations CRUD: full create/list/update(toggle)/delete cycle with auth.
    - agent: "testing"
      message: |
        Backend testing completed successfully. All 23 tests passed:
        ✅ Health endpoint working
        ✅ Auth (signup/login/me) - all scenarios tested and working
        ✅ Instagram connect - returns proper OAuth URL with correct parameters
        ✅ Instagram accounts/media - working correctly
        ✅ Automations CRUD - full lifecycle tested and working
        ✅ Webhook verify and event handler - both working correctly
        
        All endpoints return correct status codes (200/400/401/403/404) and expected responses.
        Auth protection working on all protected routes. No critical issues found.
