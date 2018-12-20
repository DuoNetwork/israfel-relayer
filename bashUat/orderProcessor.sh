rm *.log
killall -s KILL node
npm run orders server env=uat $1 &> orders.log &