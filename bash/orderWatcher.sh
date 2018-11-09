rm *.log
killall -s KILL node
npm run orderWatcher server $1 &> orderWatcher.log &