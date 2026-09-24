# Plano — RB SIMULADOR

## Objetivo
Transformar o arquivo enviado em um simulador didático de CLP mais estável e próximo do fluxo visual do TIA Portal, com o nome **RB SIMULADOR** e funcionamento direto no navegador.

## O que será construído
- Recriar a interface em React, mantendo o visual industrial compacto: barra de comandos, árvore lateral, editor Ladder, painel de propriedades, tabela de tags e rodapé de diagnóstico.
- Tornar o editor Ladder realmente utilizável: adicionar e excluir redes, inserir e editar contatos NA/NF, bobinas, fios, TON e TOF, validar endereços e reorganizar elementos.
- Implementar execução cíclica do CLP em RUN/STOP, destaque do fluxo energizado, contagem e tempo de ciclo, atualização correta de entradas, saídas, memórias e temporizadores.
- Melhorar a prática com uma tabela de observação/forçamento de tags e controles claros para acionar entradas digitais durante a simulação.
- Manter o designer de IHM com lâmpada, botões, texto e indicador vinculados às tags, incluindo seleção, movimentação e edição de propriedades.
- Permitir criar, salvar, carregar, exportar e importar projetos localmente, sem exigir conta.
- Incluir confirmações e mensagens discretas, estados vazios úteis e funcionamento adaptado para telas menores.

## Regras de simulação
- A lógica será avaliada da esquerda para a direita e de cima para baixo a cada ciclo.
- Contatos leem tags; bobinas escrevem em saídas ou memórias; TON atrasa a ativação e TOF mantém a saída durante o atraso de desligamento.
- Entradas podem ser acionadas manualmente; saídas e memórias refletem o programa em execução.
- O modo STOP interrompe os ciclos sem apagar o projeto.

## Detalhes técnicos
- Estado e motor do CLP separados da apresentação para reduzir erros e facilitar futuras instruções Ladder.
- Persistência no navegador e arquivos JSON para portabilidade dos exercícios.
- Cores, tipografia, tamanhos e estados definidos centralmente no sistema visual.
- Metadados próprios da página para “RB SIMULADOR”.

## Validação
- Testar criação e edição de uma lógica de selo simples, acionamento de entrada, energização de saída e temporização.
- Testar salvar/carregar e exportar/importar um projeto.
- Conferir a interface em computador e celular, sem sobreposição de controles.
