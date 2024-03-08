(() => {
    describe('hoge',() => {
        it('bar', () => {
            //here is assertion.
            chai.assert(true, 'succcess');

            //ui tests.
            const $$pre = document.createElement('pre');
            $$pre.style.width = '50%';
            $$pre.style.margin = 'auto'
            $$pre.innerHTML = JSON.stringify({ hello : 'world'}, null, '\t')
            document.body.appendChild($$pre);
        })
    })
    mocha.run();
})(); 
