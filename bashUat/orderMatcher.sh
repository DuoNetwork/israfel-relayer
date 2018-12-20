rm *.log
killall -s KILL node
npm run orderMatcher server env=uat $1 &> orderMatcher.log &