rm *.log
killall -s KILL node
npm run orders server $1 &> orders.log &
npm run orderWatcher server $1 &> orderWatcher.log &