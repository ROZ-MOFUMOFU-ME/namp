#!/bin/sh

npm start > start.log 2>&1 &
START_PID=$!
sleep 5

if grep -q "config.json file does not exist. Read the installation/setup instructions." start.log; then
  echo "Error detected: config.json file does not exist."
  kill $START_PID
  exit 1
else
  echo "Build and start completed successfully!"
fi

kill $START_PID

exit 0