#!/bin/sh
set -eu

# Failed sign-in tests must not throttle subsequent tests using the same address.
php occ config:system:set auth.bruteforce.protection.enabled --type=boolean --value=false
php occ config:system:set ratelimit.protection.enabled --type=boolean --value=false
php occ config:app:set dav system_addressbook_exposed --value=no

# These synthetic credentials are verified on every DAV request in the suite.
php occ config:system:set hashingMemoryCost --type=integer --value=1024
php occ config:system:set hashingTimeCost --type=integer --value=1

# The suite creates its own books and does not use generated contact suggestions.
php occ app:disable contactsinteraction
