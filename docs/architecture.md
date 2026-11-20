# Architecture 
This document is the first architecture review document.  Goal is to create a high level plan that will be refined over time

# Goals
To convert the prototype to production supporting three platforms:
* Web - responsive design, mobile first
* iOS application
* Android application

Design should be API backend that supports the three different platforms.  

## Infrastructure
* Will use containers and docker to allow for desktop development to closely match testing and deployment
* Initial deployment onto EC2 running Docker with multiple containers.  Use S3 for storage, postgress.

## Development Setup
1. AWS EC2 Setup - Testing Environment
2. Docker Environment
    2.1 Local
    2.2 EC2 Testing
3. Database Standup
    3.1 Local
    3.2 EC2 - Testing
    3.3 Alembic setup to allow for updates
4. Code deployment model
    3.1 Local
    3.2 EC2 - Testing
5. Fast API \ Web server
    5.1 Local
    5.2 EC2 Testing
6. iOS Project
5. Other?

## Archticture
I want Claude to review the prototype and its documents and come up with an architecture to support this with this documents guidance.  Provide some graphics to show how the parts fit together.  Put that section here.  Should cover all the major aspects of the prototype.  Provide an initial prioritization.

## Build Cycles
Want to do quick turns of some functionality implemented in the backend, web, iOS app.  We will come back to do the android app at a later point.
I want claude to outline a set of quick cycles to implement a set of core functionality.  Those should be placed here.  

