rm *.log
killall -s KILL node
npm run orders server $1 &> orders.log &
npm run orderBooks server $1 &> orderBooks.log &