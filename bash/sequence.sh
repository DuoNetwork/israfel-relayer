rm *.log
killall -s KILL node
npm run sequence server &> sequence.log &
