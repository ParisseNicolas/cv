
    let cachedAccessToken
    async function createJwtAndAccessToken(svc) {
      svc = JSON.parse(svc)
        // 1) Si on a un token non expiré (5 min de marge), on le réutilise
      const nowSec = Math.floor(Date.now() / 1000);
      if (cachedAccessToken && cachedAccessToken.exp - 300 > nowSec) {
        return cachedAccessToken.token;
      }

      // 2) Construire le JWT signé (RS256) depuis la clé service account (inchangé)
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
          cachedAccessToken = { token: access_token, exp: Math.floor(Date.now() / 1000) + (expires_in ?? 3600) };
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
        createJwtAndAccessToken(data.svc).then((response) => {
          sendFcm(data.projectId, response, data.fcmInput)
        })
      })
      .catch((err) => {
        console.error('Notification failed:', err);
      });
    }