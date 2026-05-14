#!/usr/bin/env python3
"""
Backend API Tests for Instagram Comment Automation SaaS
Tests all endpoints in the Next.js dynamic route /api/[[...path]]/route.js
"""

import requests
import json
import random
import string
from datetime import datetime

# Read base URL from .env
def get_base_url():
    with open('/app/.env', 'r') as f:
        for line in f:
            if line.startswith('NEXT_PUBLIC_BASE_URL='):
                return line.split('=', 1)[1].strip()
    return 'http://localhost:3000'

BASE_URL = get_base_url()
print(f"Testing against: {BASE_URL}")

# Generate random email for testing
def random_email():
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"sarah.{rand}@example.com"

# Test data
test_email = random_email()
test_password = "SecurePass123!"
auth_token = None
automation_id = None

print("\n" + "="*80)
print("INSTAGRAM COMMENT AUTOMATION SAAS - BACKEND API TESTS")
print("="*80)

# ============================================================================
# TEST 1: Health Check
# ============================================================================
print("\n[TEST 1] Health Check - GET /api/health")
try:
    response = requests.get(f"{BASE_URL}/api/health", timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        if data.get('ok') == True:
            print("✅ PASS: Health check returned ok:true")
        else:
            print(f"❌ FAIL: Expected ok:true, got {data}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 2: Auth Signup - Valid
# ============================================================================
print("\n[TEST 2] Auth Signup - POST /api/auth/signup (valid)")
try:
    payload = {"email": test_email, "password": test_password}
    response = requests.post(f"{BASE_URL}/api/auth/signup", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        data = response.json()
        if 'token' in data and 'user' in data:
            auth_token = data['token']
            user_id = data['user'].get('id')
            user_email = data['user'].get('email')
            print(f"✅ PASS: Signup successful, token received, user.id={user_id}, user.email={user_email}")
        else:
            print(f"❌ FAIL: Missing token or user in response: {data}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 3: Auth Signup - Duplicate Email
# ============================================================================
print("\n[TEST 3] Auth Signup - Duplicate email (should fail)")
try:
    payload = {"email": test_email, "password": test_password}
    response = requests.post(f"{BASE_URL}/api/auth/signup", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 400:
        data = response.json()
        if 'error' in data:
            print(f"✅ PASS: Duplicate signup rejected with 400: {data['error']}")
        else:
            print(f"❌ FAIL: Expected error field in response")
    else:
        print(f"❌ FAIL: Expected 400, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 4: Auth Signup - Missing Fields
# ============================================================================
print("\n[TEST 4] Auth Signup - Missing password field")
try:
    payload = {"email": "test@example.com"}
    response = requests.post(f"{BASE_URL}/api/auth/signup", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 400:
        print("✅ PASS: Missing field rejected with 400")
    else:
        print(f"❌ FAIL: Expected 400, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 5: Auth Login - Valid Credentials
# ============================================================================
print("\n[TEST 5] Auth Login - POST /api/auth/login (valid)")
try:
    payload = {"email": test_email, "password": test_password}
    response = requests.post(f"{BASE_URL}/api/auth/login", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        data = response.json()
        if 'token' in data:
            print(f"✅ PASS: Login successful, token received")
        else:
            print(f"❌ FAIL: Missing token in response")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 6: Auth Login - Wrong Password
# ============================================================================
print("\n[TEST 6] Auth Login - Wrong password")
try:
    payload = {"email": test_email, "password": "WrongPassword123"}
    response = requests.post(f"{BASE_URL}/api/auth/login", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 401:
        print("✅ PASS: Wrong password rejected with 401")
    else:
        print(f"❌ FAIL: Expected 401, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 7: Auth Login - Unknown Email
# ============================================================================
print("\n[TEST 7] Auth Login - Unknown email")
try:
    payload = {"email": "nonexistent@example.com", "password": "SomePass123"}
    response = requests.post(f"{BASE_URL}/api/auth/login", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 401:
        print("✅ PASS: Unknown email rejected with 401")
    else:
        print(f"❌ FAIL: Expected 401, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 8: Auth Me - With Token
# ============================================================================
print("\n[TEST 8] Auth Me - GET /api/auth/me (with token)")
try:
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        if 'user' in data and data['user'].get('email') == test_email:
            print(f"✅ PASS: Auth me returned correct user email: {data['user']['email']}")
        else:
            print(f"❌ FAIL: Expected user.email={test_email}, got {data}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 9: Auth Me - Without Token
# ============================================================================
print("\n[TEST 9] Auth Me - Without token")
try:
    response = requests.get(f"{BASE_URL}/api/auth/me", timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 401:
        print("✅ PASS: Auth me without token rejected with 401")
    else:
        print(f"❌ FAIL: Expected 401, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 10: Instagram Connect - With Auth
# ============================================================================
print("\n[TEST 10] Instagram Connect - GET /api/instagram/connect (with auth)")
try:
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = requests.get(f"{BASE_URL}/api/instagram/connect", headers=headers, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        data = response.json()
        url = data.get('url', '')
        if url.startswith('https://www.instagram.com/oauth/authorize'):
            if 'client_id=2039339197018623' in url and 'scope=' in url and 'instagram_business_basic' in url:
                print(f"✅ PASS: Instagram connect URL valid with correct client_id and scopes")
            else:
                print(f"❌ FAIL: URL missing required parameters. URL: {url}")
        else:
            print(f"❌ FAIL: Expected Instagram OAuth URL, got: {url}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 11: Instagram Connect - Without Auth
# ============================================================================
print("\n[TEST 11] Instagram Connect - Without auth")
try:
    response = requests.get(f"{BASE_URL}/api/instagram/connect", timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 401:
        print("✅ PASS: Instagram connect without auth rejected with 401")
    else:
        print(f"❌ FAIL: Expected 401, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 12: Instagram Accounts List
# ============================================================================
print("\n[TEST 12] Instagram Accounts - GET /api/instagram/accounts (with auth)")
try:
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = requests.get(f"{BASE_URL}/api/instagram/accounts", headers=headers, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        if 'accounts' in data and isinstance(data['accounts'], list):
            print(f"✅ PASS: Instagram accounts returned (count: {len(data['accounts'])})")
        else:
            print(f"❌ FAIL: Expected accounts array, got {data}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 13: Instagram Media - Nonexistent Account
# ============================================================================
print("\n[TEST 13] Instagram Media - GET /api/instagram/media?accountId=nonexistent")
try:
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = requests.get(f"{BASE_URL}/api/instagram/media?accountId=nonexistent", headers=headers, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 404:
        data = response.json()
        if 'error' in data and 'not found' in data['error'].lower():
            print(f"✅ PASS: Nonexistent account rejected with 404: {data['error']}")
        else:
            print(f"❌ FAIL: Expected 'Account not found' error, got {data}")
    else:
        print(f"❌ FAIL: Expected 404, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 14: Create Automation - Valid
# ============================================================================
print("\n[TEST 14] Create Automation - POST /api/automations (valid)")
try:
    headers = {"Authorization": f"Bearer {auth_token}"}
    payload = {
        "instagramAccountId": "dummy-ig-account-123",
        "postId": "post-456",
        "triggerWord": "price",
        "replyMessage": "Thanks for asking! Check your DM for pricing details.",
        "dmMessage": "Hi! Our pricing starts at $99/month. Visit our website for more info."
    }
    response = requests.post(f"{BASE_URL}/api/automations", json=payload, headers=headers, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        data = response.json()
        if 'automation' in data:
            auto = data['automation']
            automation_id = auto.get('_id')
            is_active = auto.get('isActive')
            if automation_id and is_active == True:
                print(f"✅ PASS: Automation created with _id={automation_id}, isActive={is_active}")
            else:
                print(f"❌ FAIL: Missing _id or isActive not true: {auto}")
        else:
            print(f"❌ FAIL: Missing automation in response")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 15: List Automations
# ============================================================================
print("\n[TEST 15] List Automations - GET /api/automations")
try:
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = requests.get(f"{BASE_URL}/api/automations", headers=headers, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        data = response.json()
        if 'automations' in data and isinstance(data['automations'], list):
            if len(data['automations']) > 0 and any(a.get('_id') == automation_id for a in data['automations']):
                print(f"✅ PASS: Automations list contains newly created automation (count: {len(data['automations'])})")
            else:
                print(f"❌ FAIL: Created automation not found in list")
        else:
            print(f"❌ FAIL: Expected automations array, got {data}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 16: Update Automation - Set isActive to false
# ============================================================================
print("\n[TEST 16] Update Automation - PUT /api/automations/:id (isActive=false)")
try:
    headers = {"Authorization": f"Bearer {auth_token}"}
    payload = {"isActive": False}
    response = requests.put(f"{BASE_URL}/api/automations/{automation_id}", json=payload, headers=headers, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        data = response.json()
        if 'automation' in data and data['automation'].get('isActive') == False:
            print(f"✅ PASS: Automation updated, isActive=false")
        else:
            print(f"❌ FAIL: Expected isActive=false, got {data}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 17: Update Automation - Change replyMessage
# ============================================================================
print("\n[TEST 17] Update Automation - PUT /api/automations/:id (replyMessage)")
try:
    headers = {"Authorization": f"Bearer {auth_token}"}
    payload = {"replyMessage": "Updated reply message!"}
    response = requests.put(f"{BASE_URL}/api/automations/{automation_id}", json=payload, headers=headers, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        data = response.json()
        if 'automation' in data and data['automation'].get('replyMessage') == "Updated reply message!":
            print(f"✅ PASS: Automation replyMessage updated")
        else:
            print(f"❌ FAIL: Expected updated replyMessage, got {data}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 18: Delete Automation
# ============================================================================
print("\n[TEST 18] Delete Automation - DELETE /api/automations/:id")
try:
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = requests.delete(f"{BASE_URL}/api/automations/{automation_id}", headers=headers, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        if data.get('success') == True:
            print(f"✅ PASS: Automation deleted successfully")
        else:
            print(f"❌ FAIL: Expected success:true, got {data}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 19: List Automations - Verify Deletion
# ============================================================================
print("\n[TEST 19] List Automations - Verify automation is deleted")
try:
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = requests.get(f"{BASE_URL}/api/automations", headers=headers, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        data = response.json()
        if 'automations' in data:
            if not any(a.get('_id') == automation_id for a in data['automations']):
                print(f"✅ PASS: Deleted automation no longer in list")
            else:
                print(f"❌ FAIL: Deleted automation still appears in list")
        else:
            print(f"❌ FAIL: Expected automations array")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 20: Automations Without Auth
# ============================================================================
print("\n[TEST 20] Create Automation - Without auth")
try:
    payload = {
        "instagramAccountId": "dummy",
        "postId": "post",
        "triggerWord": "test",
        "replyMessage": "test",
        "dmMessage": "test"
    }
    response = requests.post(f"{BASE_URL}/api/automations", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 401:
        print("✅ PASS: Create automation without auth rejected with 401")
    else:
        print(f"❌ FAIL: Expected 401, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 21: Webhook Verify - Valid Token
# ============================================================================
print("\n[TEST 21] Webhook Verify - GET /api/webhook (valid token)")
try:
    params = {
        "hub.mode": "subscribe",
        "hub.verify_token": "test",
        "hub.challenge": "12345"
    }
    response = requests.get(f"{BASE_URL}/api/webhook", params=params, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    print(f"Content-Type: {response.headers.get('content-type')}")
    
    if response.status_code == 200:
        # Should return plain text "12345", not JSON
        if response.text == "12345":
            print(f"✅ PASS: Webhook verify returned plain text challenge: {response.text}")
        else:
            print(f"❌ FAIL: Expected plain text '12345', got: {response.text}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 22: Webhook Verify - Wrong Token
# ============================================================================
print("\n[TEST 22] Webhook Verify - Wrong verify_token")
try:
    params = {
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong_token",
        "hub.challenge": "12345"
    }
    response = requests.get(f"{BASE_URL}/api/webhook", params=params, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 403:
        print(f"✅ PASS: Wrong verify_token rejected with 403")
    else:
        print(f"❌ FAIL: Expected 403, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 23: Webhook Event - POST with Sample Payload
# ============================================================================
print("\n[TEST 23] Webhook Event - POST /api/webhook (sample Instagram payload)")
try:
    payload = {
        "object": "instagram",
        "entry": [
            {
                "id": "17841400000000000",
                "time": 1234567890,
                "changes": [
                    {
                        "field": "comments",
                        "value": {
                            "id": "comment_test_1",
                            "text": "hello price",
                            "media": {
                                "id": "media_test_1"
                            },
                            "from": {
                                "id": "user_x"
                            }
                        }
                    }
                ]
            }
        ]
    }
    response = requests.post(f"{BASE_URL}/api/webhook", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        if response.text == "EVENT_RECEIVED":
            print(f"✅ PASS: Webhook event acknowledged with 200 'EVENT_RECEIVED'")
        else:
            print(f"❌ FAIL: Expected 'EVENT_RECEIVED', got: {response.text}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "="*80)
print("TEST SUITE COMPLETED")
print("="*80)
print("\nAll tests executed. Review results above for pass/fail status.")
print(f"Test user created: {test_email}")
print(f"Auth token obtained: {auth_token[:20]}..." if auth_token else "No token")
