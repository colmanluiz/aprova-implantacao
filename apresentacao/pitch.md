# Pitch: Implantação sem reunião

Deck para projetar, com 6 slides: o problema, o que percebemos, a solução, como funciona, o que muda e o próximo passo. A demo ao vivo entra depois do slide 4.

- **Deck publicado**: https://claude.ai/artifact/B6JiX2Sd44ovH9Z8y9c92W
- **Roteiro clique a clique**: `apresentacao/contexto-equipe.md` e o deck do guia.
- **Quem fala**: Luiz no slide 4 e na demo; os outros slides, a gente se reveza.

---

## Slide 1 · A conta não fecha

**Na tela**: "A conta não fecha." Um implantador cuida de 4 prefeituras, com cerca de 100 processos cada, em até 60 dias. Hoje cada processo pede uma reunião para levantar as regras. São 10 reuniões por dia, num dia de 8 horas.

**Fala (~25 s)**
> Todo mundo aqui conhece essa conta melhor do que a gente. Um implantador cuida de quatro prefeituras ao mesmo tempo, cada uma com uns cem processos, e o prazo é de até sessenta dias. Hoje, pra levantar as regras de cada processo, precisa de uma reunião. Isso dá dez reuniões por dia, num dia de oito horas. A conta não fecha. E a prefeitura também não consegue parar o balcão pra isso.

## Slide 2 · O que percebemos

**Na tela**: "O formulário quase todo já existe no modelo da Aprova." Já vem pronto: as etapas, os campos, as regras de preenchimento, os documentos de sempre. Muda de cidade para cidade: a secretaria, os documentos exigidos, as zonas e recuos da lei, a taxa.

**Fala (~25 s)**
> Quando a gente abriu os modelos de formulário da Aprova, percebeu uma coisa: quase tudo já está lá. As etapas, os campos, as regras, os documentos de sempre. O que muda de uma cidade pra outra é pouco: o nome da secretaria, quais documentos ela exige, as zonas e os recuos da lei, a taxa. Então o trabalho da implantação não é montar formulário. É descobrir essa diferença. E pra isso não precisa de reunião.

## Slide 3 · A solução

**Na tela**: "Um assistente no WhatsApp que mostra à prefeitura o que já está pronto e pergunta só o que é diferente." No ritmo do balcão, aceitando foto e PDF. O implantador acompanha tudo num painel e aprova no fim.

**Fala (~20 s)**
> A nossa solução é um assistente que conversa com a prefeitura pelo WhatsApp. Ele não manda questionário: mostra o que a Aprova já tem pronto e pergunta só o que é diferente. A pessoa responde quando pode, do jeito dela, e pode mandar foto do papel ou o PDF da lei. Enquanto isso, o implantador acompanha tudo num painel e só entra pra aprovar.

## Slide 4 · Como funciona (Luiz)

**Na tela**: quatro passos.
1. **Mostra o modelo**: manda um resumo e o PDF do formulário pronto e pergunta o que é diferente na cidade.
2. **Conversa no WhatsApp**: a prefeitura responde do jeito dela, com texto, foto do papel ou PDF da lei.
3. **Monta e testa**: aplica as mudanças no formulário e testa situações reais, sem ninguém clicar.
4. **Pessoas aprovam**: a prefeitura confere alguns casos e o implantador aprova antes de ir ao ar.

Rodapé: "A IA conversa e lê. O formulário é montado e testado por código. Quem decide é gente."

**Fala (~30 s)**
> São quatro passos. Primeiro, o assistente mostra o modelo que a Aprova já tem, com um resumo e o PDF, e pergunta o que é diferente. Depois, conversa no WhatsApp: a prefeitura responde do jeito dela, manda foto do papel ou o PDF da lei. Terceiro, o sistema aplica as mudanças e testa o formulário com situações reais, tipo "casa com recuo errado, o pedido volta". E por último, gente aprova: a prefeitura confere alguns casos e o implantador libera. A IA conversa e lê; o formulário é montado e testado por código; quem decide é sempre uma pessoa.

*Depois desta fala: trocar para a aba do painel e começar a demo.*

## Demo ao vivo

Roteiro passo a passo no guia: abrir o Alvará no painel, conversar no celular, mostrar o formulário, os testes e aprovar.

## Slide 5 · O que muda

**Na tela**: "Para a Aprova e para a prefeitura." Sem reunião para levantar regras: a prefeitura responde quando pode, pelo canal que já usa. Homologação mais rápida: o formulário chega na prefeitura já testado. Implantador com fôlego: ele acompanha e aprova, em vez de passar o dia em reunião.

**Fala (~20 s)**
> Então, o que muda. A prefeitura não precisa mais parar pra reunião: responde quando pode, pelo WhatsApp que ela já usa. O formulário chega na homologação já testado, então volta menos vezes. E o implantador deixa de passar o dia em reunião: ele acompanha pelo painel e aprova. Com isso, dá pra cuidar de mais prefeituras ao mesmo tempo.

## Slide 6 · Próximo passo

**Na tela**: importar o formulário no configurador da Aprova; ligar no WhatsApp oficial; testar com uma prefeitura de verdade. github.com/colmanluiz/aprova-implantacao

**Fala (~20 s)**
> Pra isso entrar na operação, falta pouco. O formulário já sai no formato do configurador da Aprova; o próximo passo é importar direto. O canal hoje é Telegram e vai pro WhatsApp oficial. E o que a gente mais quer é testar com uma prefeitura de verdade. Está tudo no repositório. Obrigado.
