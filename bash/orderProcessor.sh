rm *.log
killall -s KILL node
npm run orders server &> orders.log &