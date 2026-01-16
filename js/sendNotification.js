
    async function createJwtAndAccessToken() {
      // 1) Si on a un token non expiré (5 min de marge), on le réutilise
      const nowSec = Math.floor(Date.now() / 1000);
      // if (cachedAccessToken && cachedAccessToken.exp - 300 > nowSec) {
      //   return cachedAccessToken.token;
      // }

      // 2) Construire le JWT signé (RS256) depuis la clé service account (inchangé)
      const svc = {
        type: "service_account",
        project_id: "notification-cv",
        private_key_id: "8cc4754beacc2f254b3d9d741c22b97ec6f469ce",
        private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC5nZbR6bMjRtOK\nr0lAwBQ0Qzq2/77nnRRDi8QXwyrVDKHJUTfDnM4+surY8oQGK+iepBYarZkc2ZNJ\naoOyCurO+NgPhbQcRBx9yNBq50QWQEGEFBnUj8GK0RgOFKSF0QttT0Zjbvc16TGo\nTpQKopYzsHMT00bjkw5LxDz0Kb7Iv6RE3DsU1WLvSovKJXFRs0zLJkFfTMEBoxiy\nfgetkzb7o7pxcsD7lsjFzM9vCoQYkZtTGF43H4Nm5jLnRnatnuOJflJfy+Is1pTn\nwteCl7aK7wBYtuwNeunyU5ulPCWjccALrUyZVOOC4+6svu1263vjtJ+w4su5TS0l\nnnLaBshLAgMBAAECggEAC9xjQ1Wk3Ke4I9Vl9RfGaBKLDB+VN4qvkqNklpoiQLah\nGKgHzAhXRjq7oWevLQ/IOmmaKf6W2U5D8v3gnX4aGWYIXxw4Rqge4/Ydmf8zjXJy\nB/pwLhzjjWHQINzhKICTs4VMe6p0bJhSqS0gQ6ULu7uA7FmPXu0fjZLkIZFl/2uN\nEE+20TAlj6jI0QduN/9Fy3g7KxarY2QNsneRT0l3pOc/CkJbmAYTJahQhWVay78c\ndbL8gogWcAYiPvlT1ZBQYblP+C7dVX+g4sXZFKUd5gmIjJjRwdnOrr9jhiu+JMpR\nUO2sb2rOmJYFv1Yof3cMghId2j5z6kaDitgxYVkkjQKBgQDdkJfS/K0pS2WhcPHz\nWBXAGdbnOowlMg2Roc81VW+mpKbbf4205NRphBBCDLesFIgoq1vUwP07h0GsA2xc\nfDGUeeUzGl15wSBfTYY5em/mTaYNdB4WlKq8fBnzYnVvq3ENPAmV5Me5P+Pt6k9G\n1AO00z/6mzwZOFuB1K/yrihbLwKBgQDWdq7Dlzy/2gNuQcDJstFemKxXi+CkUxZa\nQYoq9difkaXwJG9FGXBLnB5o3eJQKNevoh2orVkldgmEQ9yJ8cMEAxM6BACZE/Z0\nDWFVonb7zhrU3tQL8sCZBAfxQYbxmTlO3Ayml5Tlq7pYj2tPh46ppLznkkaFTgxC\n76E1h59tpQKBgQCZJtqbgAdeFPzyRDUqpUebmwDeoqy/BUM12Gh3kE/2G7gu35Of\nZ9GgAiaO0WWgsCySGCkI/kHNBSiS82bS4xIOdNfGpEHa6HEtD1RppMV2p1PR1uL5\nbtg6I3p4ryVIBHTH1ik2EIcx+QTfrugPqHvLYX7HBsjbEgbGzrK0iEfjBwKBgFvE\nnxWMgm8pj6w/MIpeHN7Yf25aqT5HW1o1jzTAy/fDr/io7n/n2bhQzmZbA3r/bwN1\nYDGMM4gnEP1quFTCgYsW8cQycDsQYrXX/91PzpAC6lJKIvwV3LndErT2MBLzWKVY\n3YTvecQpDmzUubtnKvGGT1rbqZdjBTYjKZ0pMlwNAoGBAKru8Kyc+KtWc9kVs6OT\n0TrZ9IinInnO7+xHBydhP7/+sviXIY04pA3XYV3zElS/5WfPh96kym00ly3ClKvH\nfK86VI3wY/mLRmDmlju2+Zp8NbXHE4HL/qnWOJz+HFHo0xi26TkIHU4ANhUAtnvj\n8terH5VqOb3zz+NnDRwmAjrX\n-----END PRIVATE KEY-----\n",
        client_email: "firebase-adminsdk-fbsvc@notification-cv.iam.gserviceaccount.com",
        client_id: "115473874796029155844",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40notification-cv.iam.gserviceaccount.com",
        universe_domain: "googleapis.com"
      };
      const header = { alg: "RS256", typ: "JWT" };
      const iat = nowSec;
      const exp = iat + 3600; // 1h

      const claim = {
        iss: svc.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat,
        exp,
      };

      const enc = (ab) => {
        const bytes = typeof ab === 'string' ? new TextEncoder().encode(ab) : new Uint8Array(ab);
        let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      };

      const headerB64 = enc(JSON.stringify(header));
      const claimB64  = enc(JSON.stringify(claim));
      const unsigned  = `${headerB64}.${claimB64}`;

      const pem = (svc.private_key)
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replace(/\n/g, "");
      const raw = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
      const key = await crypto.subtle.importKey(
        "pkcs8",
        raw.buffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
      const jwt = `${unsigned}.${enc(signature)}`;

      // 3) Échanger JWT -> access token avec petit retry sur 429
      const form = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      });

      let lastErrTxt = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        console.log(`🔄 OAuth attempt ${attempt + 1}/3`);
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form
        });

        console.log(`📡 OAuth response status: ${res.status}`);

        if (res.ok) {
          const { access_token, expires_in } = await res.json();
          // Note: expires_in ~ 3600s
          // cachedAccessToken = { token: access_token, exp: Math.floor(Date.now() / 1000) + (expires_in ?? 3600) };
          return access_token;
        }

        // Si rate‑limit 429, backoff exponentiel
        if (res.status === 429) {
          console.log('⚠️ Rate limited (429), retrying...');
          const backoffMs = 500 * Math.pow(2, attempt); // 0.5s, 1s, 2s
          await sleep(backoffMs);
          continue;
        }

        lastErrTxt = await res.text();
        console.log('❌ OAuth error:', res.status, lastErrTxt);
        break; // autre erreur => sortir
      }

      throw new Error(`OAuth token error: 429/other. Details: ${lastErrTxt}`);
    }
    
    async function sendFcm(projectId, accessToken, payload) {
      if (!projectId) throw new Error("FCM_PROJECT_ID manquant");

      const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({ message: payload }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`FCM error: ${res.status} ${text}`);
      }
      return text;
    }

    function sendNotification(message) {
      const workerUrl = "https://sparkling-sun-7a8c.nicolas-parisse-93.workers.dev";
      
      console.log('get notification message from:', workerUrl);
      console.log('Message:', message);
      
      fetch(workerUrl, {
        method: "POST",
        body: message,
        headers: {
          "Content-Type": "text/plain"
        }
      })
      .then(response => {
        console.log('Response status:', response.status);
        return response.text();
      })
      .then(data => {
        console.log('Response data:', data);
        data = JSON.parse(data)
        createJwtAndAccessToken().then((response) => {
          sendFcm(data.projectId, response, data.fcmInput)
        })
      })
      .catch((err) => {
        console.error('Notification failed:', err);
      });
    }