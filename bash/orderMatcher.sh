rm *.log
killall -s KILL node
npm run orderMatcher server $1 &> orderMatcher.log &