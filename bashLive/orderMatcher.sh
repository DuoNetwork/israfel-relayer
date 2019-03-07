rm *.log
killall -s KILL node
npm run orderMatcher server env=live $1 &> orderMatcher.log &