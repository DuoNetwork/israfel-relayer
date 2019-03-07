rm *.log
killall -s KILL node
npm run orders server env=live $1 &> orders.log &