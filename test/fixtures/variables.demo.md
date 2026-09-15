---
variables:
  appName: "Acme"
  userEmail: "maya@example.com"
---

`visit("https://app.example.com")`
Welcome to {{appName}} - let's sign in.

`type("#email", "{{userEmail}}")`
Type your email address.
