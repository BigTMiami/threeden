# Browser checks (make e2e): Microsoft's Playwright image has the browsers;
# the Python package is added here, at the same version.
FROM mcr.microsoft.com/playwright/python:v1.65.0-noble
RUN pip install --no-cache-dir --break-system-packages --root-user-action=ignore playwright==1.65.0
WORKDIR /srv/e2e
