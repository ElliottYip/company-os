# Paperclip UI extraction gates

Paperclip is a competitor and reference-only source. Company OS does not import
its Web code, routes, types, assets, or runtime. Every Company OS product-page
change must pass one page gate before implementation:

1. open the real pinned Paperclip screen and capture desktop/mobile evidence;
2. identify the route, page component, directly owned state and API calls;
3. enumerate empty, loading, success, error, blocked and recovery states;
4. extract the product problem and interaction pattern without copying brand,
   text, visual identity or page source;
5. map it against Company OS's accountable-human, Demo/formal, data-governance
   and connector boundaries;
6. implement only the accepted mapping, then compare and verify it in browser.

Audit order:

1. onboarding and company creation;
2. organization, people and Agent management;
3. task creation, task detail and run timeline;
4. decisions and approvals;
5. artifacts and evidence;
6. tools, connectors, secrets and access;
7. settings, deployment and recovery surfaces.

Existing valid atlas captures remain trusted evidence and are not recaptured
without a version change or a missing state.
