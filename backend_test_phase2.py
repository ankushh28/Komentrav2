#!/usr/bin/env python3
"""
Backend API Tests for Instagram Comment Automation SaaS - Phase 2
Tests OTP verification, BullMQ webhook enqueue, and analytics endpoint
"""

import requests
import json
import random
import string
import time
from datetime import datetime
from pymongo import MongoClient

# Read base URL and MongoDB URL from .env
def get_env_var(key):
    with open('/app/.env', 'r') as f:
        for line in f:
            if line.startswith(f'{key}='):
                return line.split('=', 1)[1].strip()
    return None

BASE_URL = get_env_var('NEXT_PUBLIC_BASE_URL')
MONGO_URL = get_env_var('MONGO_URL')
DB_NAME = get_env_var('DB_NAME')

print(f"Testing against: {BASE_URL}")
print(f"MongoDB: {MONGO_URL}/{DB_NAME}")

# MongoDB connection
mongo_client = MongoClient(MONGO_URL)
db = mongo_client[DB_NAME]

# Generate random email for testing
def random_email():
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"testuser.{rand}@example.com"

# Test data
test_email1 = random_email()
test_email2 = random_email()
test_password = "SecurePass123!"
test_username = "TestUser"
auth_token = None

print("\n" + "="*80)
print("PHASE 2 BACKEND API TESTS - OTP, BULLMQ, ANALYTICS")
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
# TEST 2: Signup new user (should return needsVerification, NOT token)
# ============================================================================
print("\n[TEST 2] Auth Signup - POST /api/auth/signup (should return needsVerification)")
try:
    payload = {"email": test_email1, "password": test_password, "username": test_username}
    response = requests.post(f"{BASE_URL}/api/auth/signup", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        if data.get('needsVerification') == True and data.get('email') == test_email1:
            print(f"✅ PASS: Signup returned needsVerification:true, email:{test_email1}")
            if 'token' in data:
                print(f"❌ FAIL: Should NOT return token in signup response (OTP flow)")
            else:
                print("✅ PASS: No token in response (correct for OTP flow)")
        else:
            print(f"❌ FAIL: Expected needsVerification:true and email, got {data}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 3: Signup with missing fields
# ============================================================================
print("\n[TEST 3] Auth Signup - Missing username field")
try:
    payload = {"email": "test@example.com", "password": "pass123"}
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
# TEST 4: Repeat signup with same email but different password (should resend OTP)
# ============================================================================
print("\n[TEST 4] Auth Signup - Repeat signup with same email (should resend OTP)")
try:
    new_password = "DifferentPass456!"
    payload = {"email": test_email1, "password": new_password, "username": "DifferentUser"}
    response = requests.post(f"{BASE_URL}/api/auth/signup", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        if data.get('needsVerification') == True:
            print(f"✅ PASS: Repeat signup for unverified user succeeded (resends OTP)")
            # Update password for subsequent tests since it was changed
            test_password = new_password
        else:
            print(f"❌ FAIL: Expected needsVerification:true, got {data}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 5: Try to login before verifying (should get 403)
# ============================================================================
print("\n[TEST 5] Auth Login - Before email verification (should get 403)")
try:
    # Use the updated password from TEST 4
    payload = {"email": test_email1, "password": "DifferentPass456!"}
    response = requests.post(f"{BASE_URL}/api/auth/login", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 403:
        data = response.json()
        if data.get('needsVerification') == True and data.get('email') == test_email1:
            print(f"✅ PASS: Login before verification rejected with 403, needsVerification:true")
        else:
            print(f"❌ FAIL: Expected needsVerification:true and email in response, got {data}")
    else:
        print(f"❌ FAIL: Expected 403, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 6: Verify OTP - Read OTP from MongoDB
# ============================================================================
print("\n[TEST 6] Auth Verify OTP - POST /api/auth/verify-otp (read OTP from MongoDB)")
try:
    # Read OTP from MongoDB
    user_doc = db.users.find_one({"email": test_email1})
    if not user_doc:
        print(f"❌ FAIL: User not found in MongoDB for email {test_email1}")
    else:
        otp = user_doc.get('otp')
        print(f"OTP from MongoDB: {otp}")
        
        if not otp:
            print(f"❌ FAIL: No OTP found in user document")
        else:
            # Verify OTP
            payload = {"email": test_email1, "otp": otp}
            response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json=payload, timeout=10)
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text[:500]}")
            
            if response.status_code == 200:
                data = response.json()
                if 'token' in data and 'user' in data:
                    auth_token = data['token']
                    user_id = data['user'].get('id')
                    user_email = data['user'].get('email')
                    print(f"✅ PASS: OTP verified, token received, user.id={user_id}, user.email={user_email}")
                else:
                    print(f"❌ FAIL: Missing token or user in response: {data}")
            else:
                print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 7: Re-verify OTP (should fail with "Already verified")
# ============================================================================
print("\n[TEST 7] Auth Verify OTP - Re-verify (should fail with 'Already verified')")
try:
    user_doc = db.users.find_one({"email": test_email1})
    otp = user_doc.get('otp', '123456')  # Use dummy if not found
    
    payload = {"email": test_email1, "otp": otp}
    response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 400:
        data = response.json()
        if 'already verified' in data.get('error', '').lower():
            print(f"✅ PASS: Re-verify rejected with 'Already verified'")
        else:
            print(f"❌ FAIL: Expected 'Already verified' error, got {data}")
    else:
        print(f"❌ FAIL: Expected 400, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 8: Verify OTP with wrong code
# ============================================================================
print("\n[TEST 8] Auth Verify OTP - Wrong OTP code")
try:
    # Create a new unverified user
    test_email_wrong = random_email()
    payload = {"email": test_email_wrong, "password": test_password, "username": "WrongOTPUser"}
    requests.post(f"{BASE_URL}/api/auth/signup", json=payload, timeout=10)
    
    # Try with wrong OTP
    payload = {"email": test_email_wrong, "otp": "000000"}
    response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 400:
        data = response.json()
        if 'invalid' in data.get('error', '').lower():
            print(f"✅ PASS: Wrong OTP rejected with 'Invalid code'")
        else:
            print(f"❌ FAIL: Expected 'Invalid code' error, got {data}")
    else:
        print(f"❌ FAIL: Expected 400, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 9: Login after verification (should succeed)
# ============================================================================
print("\n[TEST 9] Auth Login - After email verification (should succeed)")
try:
    # Use the updated password from TEST 4
    payload = {"email": test_email1, "password": "DifferentPass456!"}
    response = requests.post(f"{BASE_URL}/api/auth/login", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        data = response.json()
        if 'token' in data:
            print(f"✅ PASS: Login after verification successful, token received")
        else:
            print(f"❌ FAIL: Missing token in response")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 10: Login with wrong password
# ============================================================================
print("\n[TEST 10] Auth Login - Wrong password")
try:
    payload = {"email": test_email1, "password": "WrongPassword123"}
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
# TEST 11: Resend OTP for unverified user
# ============================================================================
print("\n[TEST 11] Auth Resend OTP - POST /api/auth/resend-otp (unverified user)")
try:
    # Create a new unverified user
    test_email_resend = random_email()
    payload = {"email": test_email_resend, "password": test_password, "username": "ResendUser"}
    requests.post(f"{BASE_URL}/api/auth/signup", json=payload, timeout=10)
    
    # Get initial OTP
    user_doc_before = db.users.find_one({"email": test_email_resend})
    otp_before = user_doc_before.get('otp') if user_doc_before else None
    print(f"OTP before resend: {otp_before}")
    
    # Resend OTP
    payload = {"email": test_email_resend}
    response = requests.post(f"{BASE_URL}/api/auth/resend-otp", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        if data.get('sent') == True:
            # Verify OTP changed in MongoDB
            user_doc_after = db.users.find_one({"email": test_email_resend})
            otp_after = user_doc_after.get('otp') if user_doc_after else None
            print(f"OTP after resend: {otp_after}")
            
            if otp_after and otp_after != otp_before:
                print(f"✅ PASS: Resend OTP succeeded, OTP changed in MongoDB")
            else:
                print(f"❌ FAIL: OTP did not change in MongoDB")
        else:
            print(f"❌ FAIL: Expected sent:true, got {data}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 12: Resend OTP for already verified user (should fail)
# ============================================================================
print("\n[TEST 12] Auth Resend OTP - Already verified user (should fail)")
try:
    payload = {"email": test_email1}  # Already verified in TEST 6
    response = requests.post(f"{BASE_URL}/api/auth/resend-otp", json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 400:
        data = response.json()
        if 'already verified' in data.get('error', '').lower():
            print(f"✅ PASS: Resend OTP for verified user rejected with 'Already verified'")
        else:
            print(f"❌ FAIL: Expected 'Already verified' error, got {data}")
    else:
        print(f"❌ FAIL: Expected 400, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 13: GET /api/auth/me with verified user's token
# ============================================================================
print("\n[TEST 13] Auth Me - GET /api/auth/me (with verified user's token)")
try:
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        if 'user' in data and data['user'].get('email') == test_email1:
            print(f"✅ PASS: Auth me returned correct user: {data['user']}")
        else:
            print(f"❌ FAIL: Expected user.email={test_email1}, got {data}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 14: Webhook verify GET
# ============================================================================
print("\n[TEST 14] Webhook Verify - GET /api/webhook (valid token)")
try:
    params = {
        "hub.mode": "subscribe",
        "hub.verify_token": "test",
        "hub.challenge": "99999"
    }
    response = requests.get(f"{BASE_URL}/api/webhook", params=params, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        if response.text == "99999":
            print(f"✅ PASS: Webhook verify returned plain text challenge: {response.text}")
        else:
            print(f"❌ FAIL: Expected plain text '99999', got: {response.text}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 15: Webhook event POST (should be fast < 1000ms)
# ============================================================================
print("\n[TEST 15] Webhook Event - POST /api/webhook (should be fast < 1000ms)")
try:
    payload = {
        "object": "instagram",
        "entry": [
            {
                "id": "17841423915810255",
                "time": 1234,
                "changes": [
                    {
                        "field": "comments",
                        "value": {
                            "id": "comment_test_42",
                            "text": "hello price",
                            "media": {
                                "id": "media_test_42"
                            },
                            "from": {
                                "id": "user_xyz"
                            }
                        }
                    }
                ]
            }
        ]
    }
    
    start_time = time.time()
    response = requests.post(f"{BASE_URL}/api/webhook", json=payload, timeout=10)
    latency = (time.time() - start_time) * 1000  # Convert to ms
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    print(f"Latency: {latency:.2f}ms")
    
    if response.status_code == 200:
        if response.text == "EVENT_RECEIVED":
            print(f"✅ PASS: Webhook event acknowledged with 200 'EVENT_RECEIVED'")
            if latency < 1000:
                print(f"✅ PASS: Latency {latency:.2f}ms < 1000ms (async processing working)")
            else:
                print(f"⚠️  WARNING: Latency {latency:.2f}ms >= 1000ms (might be processing inline)")
        else:
            print(f"❌ FAIL: Expected 'EVENT_RECEIVED', got: {response.text}")
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
    
    # Check if job was enqueued (check webhook_events collection)
    time.sleep(0.5)  # Give it a moment to write
    webhook_event = db.webhook_events.find_one({"payload.entry.0.changes.0.value.id": "comment_test_42"})
    if webhook_event:
        print(f"✅ PASS: Webhook event archived in MongoDB webhook_events collection")
    else:
        print(f"⚠️  WARNING: Webhook event not found in MongoDB (might be async)")
        
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 16: Multiple webhooks in quick succession (parallel)
# ============================================================================
print("\n[TEST 16] Webhook Event - Multiple POSTs in parallel (should not reject)")
try:
    import concurrent.futures
    
    def send_webhook(i):
        payload = {
            "object": "instagram",
            "entry": [
                {
                    "id": "17841423915810255",
                    "time": 1234 + i,
                    "changes": [
                        {
                            "field": "comments",
                            "value": {
                                "id": f"comment_parallel_{i}",
                                "text": f"test comment {i}",
                                "media": {"id": "media_test"},
                                "from": {"id": f"user_{i}"}
                            }
                        }
                    ]
                }
            ]
        }
        start = time.time()
        r = requests.post(f"{BASE_URL}/api/webhook", json=payload, timeout=10)
        latency = (time.time() - start) * 1000
        return (r.status_code, r.text, latency)
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(send_webhook, i) for i in range(5)]
        results = [f.result() for f in concurrent.futures.as_completed(futures)]
    
    success_count = sum(1 for status, text, _ in results if status == 200 and text == "EVENT_RECEIVED")
    avg_latency = sum(lat for _, _, lat in results) / len(results)
    
    print(f"Results: {success_count}/5 webhooks succeeded")
    print(f"Average latency: {avg_latency:.2f}ms")
    
    if success_count == 5:
        print(f"✅ PASS: All 5 webhooks returned 200 'EVENT_RECEIVED'")
        if avg_latency < 1000:
            print(f"✅ PASS: Average latency {avg_latency:.2f}ms < 1000ms (enqueue working)")
        else:
            print(f"⚠️  WARNING: Average latency {avg_latency:.2f}ms >= 1000ms")
    else:
        print(f"❌ FAIL: Only {success_count}/5 webhooks succeeded")
        
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 17: Analytics endpoint without auth (should get 401)
# ============================================================================
print("\n[TEST 17] Analytics - GET /api/analytics (without auth)")
try:
    response = requests.get(f"{BASE_URL}/api/analytics", timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 401:
        print(f"✅ PASS: Analytics without auth rejected with 401")
    else:
        print(f"❌ FAIL: Expected 401, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# TEST 18: Analytics endpoint with auth
# ============================================================================
print("\n[TEST 18] Analytics - GET /api/analytics (with auth)")
try:
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = requests.get(f"{BASE_URL}/api/analytics", headers=headers, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:1000]}")
    
    if response.status_code == 200:
        data = response.json()
        
        # Check required keys
        required_keys = ['summary', 'timeline', 'perAutomation', 'topKeywords', 'funnel', 'recentMatches']
        missing_keys = [k for k in required_keys if k not in data]
        
        if missing_keys:
            print(f"❌ FAIL: Missing keys in response: {missing_keys}")
        else:
            print(f"✅ PASS: All required keys present: {required_keys}")
            
            # Check summary structure
            if 'totals' in data['summary']:
                totals = data['summary']['totals']
                totals_keys = ['accounts', 'automations', 'activeAutomations', 'totalTriggers', 
                              'totalReplies', 'totalDMs', 'followConvRate']
                missing_totals = [k for k in totals_keys if k not in totals]
                if missing_totals:
                    print(f"❌ FAIL: Missing keys in summary.totals: {missing_totals}")
                else:
                    print(f"✅ PASS: summary.totals has all required keys")
            else:
                print(f"❌ FAIL: Missing summary.totals")
            
            # Check runsLast7Days
            if 'runsLast7Days' in data['summary']:
                print(f"✅ PASS: summary.runsLast7Days present: {data['summary']['runsLast7Days']}")
            else:
                print(f"❌ FAIL: Missing summary.runsLast7Days")
            
            # Check timeline (should be array of 7 entries)
            if isinstance(data['timeline'], list):
                if len(data['timeline']) == 7:
                    print(f"✅ PASS: timeline has 7 entries")
                    if all('date' in entry and 'count' in entry for entry in data['timeline']):
                        print(f"✅ PASS: All timeline entries have date and count")
                    else:
                        print(f"❌ FAIL: Some timeline entries missing date or count")
                else:
                    print(f"❌ FAIL: timeline has {len(data['timeline'])} entries, expected 7")
            else:
                print(f"❌ FAIL: timeline is not an array")
            
            # Check perAutomation is array
            if isinstance(data['perAutomation'], list):
                print(f"✅ PASS: perAutomation is array (length: {len(data['perAutomation'])})")
            else:
                print(f"❌ FAIL: perAutomation is not an array")
            
            # Check topKeywords is array
            if isinstance(data['topKeywords'], list):
                print(f"✅ PASS: topKeywords is array (length: {len(data['topKeywords'])})")
            else:
                print(f"❌ FAIL: topKeywords is not an array")
            
            # Check funnel structure
            if isinstance(data['funnel'], dict):
                funnel_keys = ['triggers', 'replies', 'followGated', 'followConfirmed', 'dmsSent']
                missing_funnel = [k for k in funnel_keys if k not in data['funnel']]
                if missing_funnel:
                    print(f"❌ FAIL: Missing keys in funnel: {missing_funnel}")
                else:
                    print(f"✅ PASS: funnel has all required keys")
            else:
                print(f"❌ FAIL: funnel is not an object")
            
            # Check recentMatches is array
            if isinstance(data['recentMatches'], list):
                print(f"✅ PASS: recentMatches is array (length: {len(data['recentMatches'])})")
            else:
                print(f"❌ FAIL: recentMatches is not an array")
                
    else:
        print(f"❌ FAIL: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"❌ FAIL: Exception - {e}")

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "="*80)
print("PHASE 2 TEST SUITE COMPLETED")
print("="*80)
print("\nAll tests executed. Review results above for pass/fail status.")
print(f"Test user 1 (verified): {test_email1}")
print(f"Auth token: {auth_token[:30]}..." if auth_token else "No token")

# Close MongoDB connection
mongo_client.close()
