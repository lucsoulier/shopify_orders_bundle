// app/routes/_index.jsx
import { Page, Card, Text, Button } from "@shopify/polaris";
import { Link } from "react-router";

export default function Index() {
  return (
    <Page title="OP Orders Bundle">
      <Card>
        <Text as="h2" variant="headingMd">
          Bienvenue sur OP Orders Bundle
        </Text>
        <Text as="p" variant="bodyMd">
          Cette application vous permet de visualiser vos commandes avec les bundles regroupés.
        </Text>
        <Link to="/app/orders">
          <Button variant="primary">Voir les commandes</Button>
        </Link>
      </Card>
    </Page>
  );
}