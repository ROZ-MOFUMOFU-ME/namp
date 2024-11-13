#!/bin/sh

npm start > start.log 2>&1 &
START_PID=$!
sleep 5

if grep -q "config.json file does not exist. Read the installation/setup instructions." start.log; then
  echo "Build and start completed successfully!"
  kill $START_PID
  exit 0
else
  echo "An unexpected error occurred!"
  kill $START_PID
  exit 1
fi